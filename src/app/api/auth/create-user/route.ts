import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN = 8

export async function POST(req: Request) {
  try {
    const { allowed, retryAfter } = await checkRateLimit(`create-user:${getClientIp(req)}`, 5, 300)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const { email, password, username, full_name, phone, role: rawRole, terms_accepted } = await req.json()

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    if (!password || password.length < PASSWORD_MIN) {
      return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN} characters` }, { status: 400 })
    }
    if (!username || username.length < 3 || username.length > 30) {
      return NextResponse.json({ error: 'Username must be 3-30 characters' }, { status: 400 })
    }
    if (!full_name || full_name.length < 2) {
      return NextResponse.json({ error: 'Full name required' }, { status: 400 })
    }

    // Only allow hunter or lister self-selection; admin requires separate approval flow
    const role = rawRole === 'lister' ? 'lister' : 'hunter'

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

    // Fire-and-forget admin notification; never block signup on email delivery
    notifyAdmins(
      'New User Registration',
      'New User Signed Up',
      { Name: full_name, Username: username, Email: email, Phone: phone || 'N/A', Role: role }
    ).catch(() => {})

    return NextResponse.json({ user: { id: data.user.id, email: data.user.email } })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
