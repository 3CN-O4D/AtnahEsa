import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session?.user) {
      const userId = session.user.id
      const meta = session.user.user_metadata || {}
      const fullName = meta.full_name || meta.name || session.user.email?.split('@')[0] || 'User'
      const avatarUrl = meta.avatar_url || meta.picture || ''
      const username = meta.username || meta.preferred_username || session.user.email?.split('@')[0] || ''

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: fullName,
          username: username,
          avatar_url: avatarUrl,
          role: 'hunter',
          terms_accepted: true,
        }, { onConflict: 'id' })

      if (profileError) {
        console.error('Failed to upsert profile for Google user:', profileError)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_failed`)
}
