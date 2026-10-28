import type { NextConfig } from 'next'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ewfyrnxwmqdhlzpcfxxg.supabase.co'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''

// CSP that works with Next.js and Supabase auth
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.clarity.ms",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://img.youtube.com https:",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_URL} wss://${SUPABASE_URL.replace('https://', '')} https://www.clarity.ms https:`,
  "frame-src https://www.youtube.com https://www.tiktok.com https://tiktok.com",
  "media-src 'self' blob: https:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'pub-*.r2.dev' },
      ...(R2_PUBLIC_URL ? [{ protocol: 'https' as const, hostname: new URL(R2_PUBLIC_URL).hostname }] : []),
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
          { key: 'Content-Security-Policy', value: csp },
          // COOP/COEP can break OAuth flows - use same-origin-allow-popups instead
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Access-Control-Allow-Origin', value: 'https://www.asehanta.com' },
        ],
      },
    ]
  },
  serverExternalPackages: ['pdfkit'],
}

export default nextConfig
