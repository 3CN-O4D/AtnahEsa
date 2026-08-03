import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findValidOtp, recordOtpFailure } from '@/lib/otp'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    const { otp } = await req.json()

    if (!otp) {
      return NextResponse.json({ error: 'Missing OTP' }, { status: 400 })
    }

    const { allowed, retryAfter } = await checkRateLimit(`otp-delete-account:${getClientIp(req)}`, 10, 60)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const otpData = await findValidOtp(admin, user.email, otp, ['delete_account'])

    if (!otpData) {
      await recordOtpFailure(admin, user.email, ['delete_account'])
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    await admin.from('otps').update({ used: true }).eq('id', otpData.id)

    const { error: listingsErr } = await admin.from('listings').delete().eq('uploader_id', user.id)
    if (listingsErr) {
      return NextResponse.json({ error: listingsErr.message }, { status: 500 })
    }

    const { error: profileErr } = await admin.from('profiles').delete().eq('id', user.id)
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    const { error: authErr } = await admin.auth.admin.deleteUser(user.id)
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
