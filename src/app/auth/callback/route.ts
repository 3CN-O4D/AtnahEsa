import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { callbackDestination } from '@/lib/auth-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  const cookieStore = await cookies()
  const rawCookieNext = cookieStore.get('auth_next')?.value
  let cookieNext: string | null = rawCookieNext ?? null
  if (cookieNext?.startsWith('%')) {
    try {
      cookieNext = decodeURIComponent(cookieNext)
    } catch {
      cookieNext = null
    }
  }

  const next = callbackDestination(
    searchParams.get('next') ?? searchParams.get('callbackUrl') ?? cookieNext
  )

  if (code) {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session?.user) {
      const userId = session.user.id
      const meta = session.user.user_metadata || {}
      const fullName = meta.full_name || meta.name || session.user.email?.split('@')[0] || 'User'
      const avatarUrl = meta.avatar_url || meta.picture || ''
      const username = meta.username || meta.preferred_username || session.user.email?.split('@')[0] || ''

      const isGoogle = session.user.app_metadata?.provider === 'google'

      const { data: existing } = await supabase
        .from('profiles')
        .select('role, verified')
        .eq('id', userId)
        .maybeSingle()

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: fullName,
          username: username,
          avatar_url: avatarUrl,
          role: existing?.role || 'hunter',
          verified: existing?.verified || false,
          terms_accepted: true,
          has_password: !isGoogle,
        }, { onConflict: 'id' })

      if (profileError) {
        console.error('Failed to upsert profile for Google user:', profileError)
      }

      const success = NextResponse.redirect(`${origin}${next}`)
      success.cookies.set('auth_next', '', { path: '/', maxAge: 0 })
      return success
    }
  }

  const failureUrl = new URL('/auth/signin', origin)
  failureUrl.searchParams.set('error', 'auth_callback_failed')
  if (next !== '/') failureUrl.searchParams.set('callbackUrl', next)
  const failure = NextResponse.redirect(failureUrl)
  failure.cookies.set('auth_next', '', { path: '/', maxAge: 0 })
  return failure
}
