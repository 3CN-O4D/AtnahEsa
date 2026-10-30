import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Skip middleware for RSC payload prefetch requests
  const isRscPrefetch = 
    req.headers.get('next-router-prefetch') === '1' ||
    req.headers.get('next-router-state-tree') !== null ||
    req.headers.get('purpose') === 'prefetch' ||
    req.nextUrl.searchParams.has('_rsc')

  if (isRscPrefetch) {
    return res
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      const signIn = new URL('/auth/signin', req.url)
      signIn.searchParams.set('callbackUrl', `${req.nextUrl.pathname}${req.nextUrl.search}`)
      return NextResponse.redirect(signIn)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*'],
}