import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findValidOtp, recordOtpFailure } from '@/lib/otp'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { saveUserRoles } from '@/lib/profile-roles'
import { rolesForMetadata } from '@/lib/roles'

export async function POST(req: Request) {
  try {
    const { full_name, username, phone, roles, role: rawRole, otp } = await req.json()

    if (!full_name || !username || !otp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { allowed, retryAfter } = await checkRateLimit(`otp-profile-update:${getClientIp(req)}`, 10, 60)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const otpData = await findValidOtp(admin, user.email, otp, ['profile_update'])

    if (!otpData) {
      await recordOtpFailure(admin, user.email, ['profile_update'])
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    await admin.from('otps').update({ used: true }).eq('id', otpData.id)

    const { data: current } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const changedRoles = roles !== undefined || rawRole !== undefined
    let savedRole = (current as { role?: string } | null)?.role || 'hunter'

    if (changedRoles) {
      const result = await saveUserRoles(
        admin,
        user.id,
        { roles, role: rawRole },
        {
          currentRole: savedRole,
          currentMetadata: user.user_metadata as Record<string, unknown> | undefined,
        }
      )
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
      savedRole = result.role || savedRole
    } else {
      // Keep the JWT metadata in sync even when the user only edits name/phone.
      const rolesList = rolesForMetadata(savedRole)
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata as Record<string, unknown> | undefined),
          role: savedRole,
          roles: rolesList,
        },
      })
    }

    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        full_name,
        username,
        phone: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (profileErr) {
      if (profileErr.message.includes('username') && profileErr.message.includes('unique')) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
      }
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      role: savedRole,
      roles: rolesForMetadata(savedRole),
    })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
