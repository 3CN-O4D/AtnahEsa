import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.asehanta.com'

  const staticRoutes = [
    '',
    '/movers',
    '/wifi',
    '/contact',
    '/request-house',
    '/terms',
    '/listers',
    '/taken',
  ]

  const staticPages: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: route === '' ? 1 : 0.7,
  }))

  let listingPages: MetadataRoute.Sitemap = []
  try {
    const supabase = await createClient()
    const { data: listings } = await supabase
      .from('listings')
      .select('id, updated_at')
      .in('status', ['published', 'taken'])
      .order('created_at', { ascending: false })
      .limit(5000)

    listingPages = (listings || []).map((listing) => ({
      url: `${baseUrl}/listings/${listing.id}`,
      lastModified: new Date(listing.updated_at || Date.now()),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))
  } catch {
    // listings query failure shouldn't break the sitemap
  }

  return [...staticPages, ...listingPages]
}
