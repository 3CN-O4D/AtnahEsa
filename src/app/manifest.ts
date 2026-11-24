import type { MetadataRoute } from 'next'
import { APP_NAME } from '@/lib/constants'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${APP_NAME} - Find Your Perfect Home`,
    short_name: APP_NAME,
    description: 'Browse houses, book viewings, manage escrow and chat with Ase from your home screen.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#0B1F3A',
    theme_color: '#0B1F3A',
    lang: 'en',
    categories: ['lifestyle', 'business', 'shopping'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Browse houses',
        short_name: 'Houses',
        description: 'Find a new place to stay.',
        url: '/listings',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'My Escrow',
        short_name: 'Escrow',
        description: 'Track your escrow and payments.',
        url: '/my-escrow',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
