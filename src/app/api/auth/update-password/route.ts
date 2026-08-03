import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findValidOtp, recordOtpFailure } from '@/lib/otp'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    const { email, password, otp } = await req.json()

    if (!email || !password || password.length < 6 || !otp) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { allowed, retryAfter } = await checkRateLimit(`otp-update-password:${getClientIp(req)}`, 10, 60)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const supabase = createAdminClient()

    const otpRow = await findValidOtp(supabase, email, otp, ['password_reset', 'password_create'])

    if (!otpRow) {
      await recordOtpFailure(supabase, email, ['password_reset', 'password_create'])
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    await supabase.from('otps').update({ used: true }).eq('id', otpRow.id)

    const { data: users } = await supabase.auth.admin.listUsers()
    const user = users?.users.find((u) => u.email === email)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password })
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
