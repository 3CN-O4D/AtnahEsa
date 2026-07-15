import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { email, otp, type } = await req.json()

    if (!email || !otp || !['signup', 'password_reset'].includes(type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('otps')
      .select('*')
      .eq('email', email)
      .eq('otp', otp)
      .eq('type', type)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    await supabase
      .from('otps')
      .update({ used: true })
      .eq('id', data.id)

    if (type === 'signup') {
      const { data: users, error: userError } = await supabase.auth.admin.listUsers()
      if (userError) {
        return NextResponse.json({ error: 'Failed to confirm user' }, { status: 500 })
      }
      const user = users.users.find((u) => u.email === email)
      if (user) {
        await supabase.auth.admin.updateUserById(user.id, { email_confirm: true })
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
