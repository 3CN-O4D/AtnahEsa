import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.asehanta.com'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api', '/auth', '/profile', '/my-listings', '/my-bookings', '/upload', '/stats', '/forbidden'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
