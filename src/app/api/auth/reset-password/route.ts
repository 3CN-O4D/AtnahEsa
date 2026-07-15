import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { email, otp, password } = await req.json()

    if (!email || !otp || !password || password.length < 6) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: otpRow, error: otpError } = await supabase
      .from('otps')
      .select('*')
      .eq('email', email)
      .eq('otp', otp)
      .eq('type', 'password_reset')
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .single()

    if (otpError || !otpRow) {
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
