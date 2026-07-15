import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOtpEmail } from '@/lib/email'

export async function POST(req: Request) {
  try {
    const { email, type } = await req.json()

    if (!email || !['signup', 'password_reset'].includes(type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const otp = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('otps')
      .insert({ email, otp, type, expires_at: expiresAt })

    if (dbError) {
      return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 500 })
    }

    try {
      await sendOtpEmail(email, otp, type)
    } catch (emailErr) {
      console.error('Failed to send OTP email:', emailErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }
}
