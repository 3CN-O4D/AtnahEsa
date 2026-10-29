import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAuthUserByEmail } from '@/lib/supabase/admin-users'
import { findValidOtp, recordOtpFailure } from '@/lib/otp'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    const { email, otp, type } = await req.json()

    if (!email || !otp || !['signup', 'password_reset', 'profile_update'].includes(type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { allowed, retryAfter } = await checkRateLimit(`otp-verify:${email}`, 20, 300)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const supabase = createAdminClient()

    const data = await findValidOtp(supabase, email, otp, [type])

    if (!data) {
      await recordOtpFailure(supabase, email, [type])
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    if (type !== 'password_reset') {
      await supabase.from('otps').update({ used: true }).eq('id', data.id)
      if (type === 'signup') {
        const user = await findAuthUserByEmail(email)
        if (user) {
          await supabase.auth.admin.updateUserById(user.id, { email_confirm: true })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
