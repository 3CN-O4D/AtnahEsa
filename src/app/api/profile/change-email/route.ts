import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { new_email, otp } = await req.json()

    if (!new_email || !otp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
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

    const { data: otpData, error: otpErr } = await admin
      .from('otps')
      .select('id')
      .eq('email', new_email)
      .eq('otp', otp)
      .eq('type', 'email_change')
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .single()

    if (otpErr || !otpData) {
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
