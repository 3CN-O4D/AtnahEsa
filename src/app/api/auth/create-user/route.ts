import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAuthUserByEmail } from '@/lib/supabase/admin-users'
import { notifyAdmins } from '@/lib/notify'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { passwordError } from '@/lib/password'
import { saveUserRoles } from '@/lib/profile-roles'
import { roleFromInput } from '@/lib/roles'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const { allowed, retryAfter } = await checkRateLimit(`create-user:${getClientIp(req)}`, 5, 300)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const { email, password, username, full_name, phone, roles, role: rawRole, terms_accepted } = await req.json()

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    const passwordProblem = passwordError(password)
    if (passwordProblem) {
      return NextResponse.json({ error: passwordProblem }, { status: 400 })
    }
    if (!username || username.length < 3 || username.length > 30) {
      return NextResponse.json({ error: 'Username must be 3-30 characters' }, { status: 400 })
    }
    if (!full_name || full_name.length < 2) {
      return NextResponse.json({ error: 'Full name required' }, { status: 400 })
    }

    // A user may pick hunter, lister, or both. Admin is never self-assigned.
    const role = roleFromInput(roles, rawRole, 'hunter')
    const supabase = createAdminClient()

    // An existing account is not an error: it is the same person adding a role
    // (e.g. a lister who now wants to hunt). Verify ownership with the signup
    // OTP instead of asking them to create a second account.
    const existing = await findAuthUserByEmail(email)

    if (existing) {
      const { error } = await saveUserRoles(
        supabase,
        existing.id,
        { roles, role: rawRole },
        {
          currentRole: (existing.user_metadata as Record<string, unknown> | undefined)?.role,
          currentMetadata: existing.user_metadata as Record<string, unknown> | undefined,
        }
      )
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      await supabase
        .from('profiles')
        .update({ full_name, username, phone: phone || null, terms_accepted: !!terms_accepted, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      return NextResponse.json({ user: { id: existing.id, email: existing.email }, existing: true })
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { username, full_name, phone, role, roles: role === 'both' ? ['hunter', 'lister'] : [role], terms_accepted: !!terms_accepted },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // The DB trigger always inserts 'hunter'; apply the chosen roles here.
    await saveUserRoles(
      supabase,
      data.user.id,
      { roles, role: rawRole },
      { currentRole: role, currentMetadata: data.user.user_metadata as Record<string, unknown> | undefined }
    )

    // Fire-and-forget admin notification; never block signup on email delivery
    notifyAdmins(
      'New User Registration',
      'New User Signed Up',
      { Name: full_name, Username: username, Email: email, Phone: phone || 'N/A', Role: role }
    ).catch(() => {})

    return NextResponse.json({ user: { id: data.user.id, email: data.user.email }, existing: false })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
