import type { NextConfig } from 'next'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ewfyrnxwmqdhlzpcfxxg.supabase.co'
const R2_ENDPOINT = process.env.R2_ENDPOINT || ''
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'pub-*.r2.dev' },
      { protocol: 'https', hostname: new URL(R2_PUBLIC_URL).hostname || 'media.asehanta.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // H-C: remove 'unsafe-inline'; use strict-dynamic + nonce-compatible sources
              "script-src 'self' 'strict-dynamic' https:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://res.cloudinary.com https://img.youtube.com https:" + (R2_PUBLIC_URL ? ` ${R2_PUBLIC_URL}` : ''),
              "font-src 'self' data:",
              `connect-src 'self' ${SUPABASE_URL} wss://${SUPABASE_URL.replace('https://', '')}` + (R2_ENDPOINT ? ` ${R2_ENDPOINT}` : '') + (R2_PUBLIC_URL ? ` ${R2_PUBLIC_URL}` : ''),
              "frame-src https://www.youtube.com https://www.tiktok.com https://tiktok.com",
              "media-src 'self' blob: https:" + (R2_PUBLIC_URL ? ` ${R2_PUBLIC_URL}` : ''),
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          { key: 'Access-Control-Allow-Origin', value: 'https://www.asehanta.com' },
        ],
      },
    ]
  },
  serverExternalPackages: ['pdfkit'],
}

export default nextConfig
