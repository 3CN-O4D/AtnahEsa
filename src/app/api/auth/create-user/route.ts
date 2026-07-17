import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const { email, password, username, full_name, phone, role, terms_accepted } = await req.json()

    if (!email || !password || !username || !full_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { username, full_name, phone, role, terms_accepted: !!terms_accepted },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    notifyAdmins(
      'New User Registration',
      'New User Signed Up',
      { Name: full_name, Username: username, Email: email, Phone: phone || 'N/A', Role: role || 'hunter' }
    )

    return NextResponse.json({ user: { id: data.user.id, email: data.user.email } })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
