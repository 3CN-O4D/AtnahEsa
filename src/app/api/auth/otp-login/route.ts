import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAuthUserByEmail } from '@/lib/supabase/admin-users'
import { findValidOtp, recordOtpFailure } from '@/lib/otp'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

/**
 * Passwordless email-code sign-in.
 *
 * We verify the code with our own `otps` table (Brevo-delivered), then mint a
 * single-use Supabase magic-link token so the client can open a real session
 * with `supabase.auth.verifyOtp`.
 */
export async function POST(req: Request) {
  try {
    const { email, otp } = await req.json()

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
    }

    const { allowed, retryAfter } = await checkRateLimit(`otp-login:${getClientIp(req)}`, 10, 60)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    const admin = createAdminClient()

    const otpRow = await findValidOtp(admin, email, String(otp), ['login'])
    if (!otpRow) {
      await recordOtpFailure(admin, email, ['login'])
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
    }

    const user = await findAuthUserByEmail(email)
    if (!user) {
      return NextResponse.json({ error: 'No account found for that email' }, { status: 404 })
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    const tokenHash = data?.properties?.hashed_token
    if (error || !tokenHash) {
      return NextResponse.json(
        { error: 'Could not start your session. Please try again.' },
        { status: 500 }
      )
    }

    // Only burn the code once a session token is ready.
    await admin.from('otps').update({ used: true }).eq('id', otpRow.id)

    return NextResponse.json({ token_hash: tokenHash })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
