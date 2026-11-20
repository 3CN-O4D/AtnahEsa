import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAuthUserByEmail, findAuthUserByPhone } from '@/lib/supabase/admin-users'
import { sendOtpEmail } from '@/lib/email'
import { sendOtpWhatsApp } from '@/lib/whatsapp/outbox'
import { checkRateLimit } from '@/lib/rate-limit'
import { randomInt } from 'crypto'

const VALID_TYPES = ['signup', 'login', 'password_reset', 'password_create', 'profile_update', 'email_change', 'delete_account']

export async function POST(req: Request) {
  try {
    const { email, phone, type } = await req.json()

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const emailValue = email && String(email).trim()
    const phoneValue = phone && String(phone).trim()
    if (!emailValue && !phoneValue) {
      return NextResponse.json({ error: 'Email or phone is required' }, { status: 400 })
    }

    const identifier = (emailValue || phoneValue || '').toLowerCase()
    const { allowed, retryAfter } = await checkRateLimit(`otp-send:${identifier}`, 1000, 3600)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many reset code requests for this email. Try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const supabase = createAdminClient()

    // Resolve the identifier to the account's email (the `otps` table is
    // email-keyed). A phone maps back to the account that owns it.
    const phoneRequest = Boolean(phoneValue)
    let accountEmail = emailValue || ''
    const resolvedPhone: string | null = phoneValue || null
    let accountFound = Boolean(emailValue)

    if (phoneValue) {
      const user = await findAuthUserByPhone(phoneValue)
      if (user?.email) {
        accountEmail = user.email
        accountFound = true
      }
    } else if (!accountEmail && type !== 'signup') {
      const user = await findAuthUserByEmail(identifier)
      accountFound = Boolean(user)
    }

    // Never reveal which accounts exist: for password_reset without a match,
    // respond as if the code went out. For login/profile flows a phone with no
    // account gets the same generic treatment as a wrong email.
    if (!accountFound && type === 'password_reset') {
      return NextResponse.json({ success: true, emailSent: false })
    }
    if (!accountFound && phoneRequest && type !== 'signup') {
      return NextResponse.json({ success: true, emailSent: false, channel: 'whatsapp' })
    }
    if (!accountFound && !accountEmail && type !== 'signup') {
      return NextResponse.json({ error: 'No account found for that number' }, { status: 404 })
    }

    // Signup keys strictly by the submitted email; the phone (when provided)
    // is only an extra delivery channel for the same code.
    const otpEmail = accountEmail || emailValue || ''

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('otps')
      .select('*', { count: 'exact', head: true })
      .eq('email', otpEmail)
      .eq('type', type)
      .gte('created_at', fiveMinAgo)

    if (count && count >= 5) {
      return NextResponse.json({ error: 'Too many codes sent. Try again in 5 minutes.' }, { status: 429 })
    }

    // Invalidate any previous unused OTPs for this email+type
    await supabase
      .from('otps')
      .update({ used: true })
      .eq('email', otpEmail)
      .eq('type', type)
      .eq('used', false)

    // Use crypto.randomInt instead of Math.random
    const otp = String(randomInt(100000, 999999))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('otps')
      .insert({ email: otpEmail, otp, type, expires_at: expiresAt })

    if (dbError) {
      return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 500 })
    }

    let emailSent = false
    let whatsappQueued = false

    // Phone-first: the code goes to the WhatsApp number on file.
    if (phoneRequest) {
      await sendOtpWhatsApp(otpEmail, otp, type, resolvedPhone)
      whatsappQueued = true
    }

    // Email delivery: phone-only signups have no email to send to, but every
    // other path does — send it as the reliable fallback. Phone-first requests
    // already queued the WhatsApp copy, so skip the email's own mirror.
    if (otpEmail && otpEmail.includes('@')) {
      try {
        await sendOtpEmail(otpEmail, otp, type, { skipWhatsAppMirror: phoneRequest })
        emailSent = true
      } catch (emailErr) {
        console.error('Failed to send OTP email:', emailErr)
        if (!whatsappQueued) {
          return NextResponse.json({ error: 'Failed to send verification code. Please try again.' }, { status: 500 })
        }
      }
    } else if (!whatsappQueued) {
      return NextResponse.json({ error: 'Nothing to send the code to.' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      emailSent,
      // The client needs the resolved email to verify the code later.
      ...(phoneRequest && accountEmail ? { email: accountEmail } : {}),
      channel: phoneRequest ? 'whatsapp' : 'email',
    })
  } catch (err) {
    console.error('send-otp error:', err)
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }
}
