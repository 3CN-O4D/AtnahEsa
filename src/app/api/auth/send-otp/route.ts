import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAuthUserByEmail } from '@/lib/supabase/admin-users'
import { sendOtpEmail } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { randomInt } from 'crypto'

export async function POST(req: Request) {
  try {
    const { email, type } = await req.json()

    if (!email || !['signup', 'password_reset', 'password_create', 'profile_update', 'email_change', 'delete_account'].includes(type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { allowed, retryAfter } = await checkRateLimit(`otp-send:${getClientIp(req)}`, 10, 60)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const supabase = createAdminClient()

    if (type === 'password_reset') {
      const user = await findAuthUserByEmail(email)
      if (!user) {
        return NextResponse.json({ success: true, emailSent: false })
      }
    }

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('otps')
      .select('*', { count: 'exact', head: true })
      .eq('email', email)
      .eq('type', type)
      .gte('created_at', fiveMinAgo)

    if (count && count >= 5) {
      return NextResponse.json({ error: 'Too many codes sent. Try again in 5 minutes.' }, { status: 429 })
    }

    // Invalidate any previous unused OTPs for this email+type
    await supabase
      .from('otps')
      .update({ used: true })
      .eq('email', email)
      .eq('type', type)
      .eq('used', false)

    // Use crypto.randomInt instead of Math.random
    const otp = String(randomInt(100000, 999999))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('otps')
      .insert({ email, otp, type, expires_at: expiresAt })

    if (dbError) {
      return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 500 })
    }

    let emailSent = false
    try {
      await sendOtpEmail(email, otp, type)
      emailSent = true
    } catch (emailErr) {
      console.error('Failed to send OTP email:', emailErr)
      return NextResponse.json({ error: 'Failed to send verification email. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, emailSent })
  } catch (err) {
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }
}