import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOtpEmail } from '@/lib/email'

export async function POST(req: Request) {
  try {
    const { email, type } = await req.json()

    if (!email || !['signup', 'password_reset', 'password_create', 'profile_update', 'email_change'].includes(type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createAdminClient()

    if (type === 'password_reset') {
      const { data: users } = await supabase.auth.admin.listUsers()
      const exists = users?.users.some((u) => u.email === email)
      if (!exists) {
        return NextResponse.json({ error: 'No account found with this email' }, { status: 404 })
      }
    }

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('otps')
      .select('*', { count: 'exact', head: true })
      .eq('email', email)
      .eq('type', type)
      .gte('created_at', fiveMinAgo)

    if (count && count >= 3) {
      return NextResponse.json({ error: 'Too many requests. Try again in 5 minutes.' }, { status: 429 })
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000))
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
    }

    return NextResponse.json({ success: true, emailSent })
  } catch (err) {
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }
}
