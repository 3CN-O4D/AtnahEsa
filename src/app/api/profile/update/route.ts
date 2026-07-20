import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { full_name, username, phone, otp } = await req.json()

    if (!full_name || !username || !otp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: otpData, error: otpErr } = await admin
      .from('otps')
      .select('id')
      .eq('email', user.email)
      .eq('otp', otp)
      .eq('type', 'profile_update')
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .single()

    if (otpErr || !otpData) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    await admin.from('otps').update({ used: true }).eq('id', otpData.id)

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ full_name, username, phone, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (profileErr) {
      if (profileErr.message.includes('username') && profileErr.message.includes('unique')) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
      }
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
