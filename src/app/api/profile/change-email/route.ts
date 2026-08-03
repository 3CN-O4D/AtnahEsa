import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findValidOtp, recordOtpFailure } from '@/lib/otp'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    const { new_email, otp } = await req.json()

    if (!new_email || !otp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const { allowed, retryAfter } = await checkRateLimit(`otp-email-change:${getClientIp(req)}`, 10, 60)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (new_email === user.email) {
      return NextResponse.json({ error: 'New email is the same as current email' }, { status: 400 })
    }

    const admin = createAdminClient()

    const otpData = await findValidOtp(admin, new_email, otp, ['email_change'])

    if (!otpData) {
      await recordOtpFailure(admin, new_email, ['email_change'])
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    await admin.from('otps').update({ used: true }).eq('id', otpData.id)

    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
      email: new_email,
      email_confirm: true,
    })

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
