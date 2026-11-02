import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { canonicalListingPath } from '@/lib/link-recovery'

export async function middleware(req: NextRequest) {
  // Repair edited / legacy listing links before they can reach the 404 page.
  // This is pure string work, so it stays cheap on the edge.
  if (req.method === 'GET' || req.method === 'HEAD') {
    const repaired = canonicalListingPath(req.nextUrl.pathname)
    if (repaired) {
      const url = req.nextUrl.clone()
      url.pathname = repaired
      // 308 keeps the method and body, and tells search engines the new URL.
      return NextResponse.redirect(url, 308)
    }
  }

  // Every route below needs the admin session only. Return early for public
  // pages so adding listing prefixes to the matcher does not cost a Supabase
  // round-trip on normal browsing.
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

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

  return res
}

export const config = {
  matcher: [
    // Admin auth
    '/admin/:path*',
    // Listing link shapes that people share or edit by hand. Canonical
    // `/listings/<uuid>` requests are recognised and passed straight through.
    '/listing/:path*',
    '/listings/:path*',
    '/house/:path*',
    '/houses/:path*',
    '/home/:path*',
    '/homes/:path*',
    '/property/:path*',
    '/properties/:path*',
    '/rental/:path*',
    '/rentals/:path*',
    '/view/:path*',
    '/details/:path*',
    '/listing-details/:path*',
    '/l/:path*',
    '/p/:path*',
  ],
}
