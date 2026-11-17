'use client'

import { photoVariantUrl } from '@/lib/image-src'

/**
 * Global `next/image` loader.
 *
 * No Vercel image optimizer: listing photos point at pre-generated WebP
 * variants in R2 (see `src/lib/image-src.ts`), everything else is served from
 * its original URL. That keeps the Vercel transformation cap at zero while
 * still sending the browser a right-sized image.
 */
export default function imageLoader({ src, width }: { src: string; width: number }) {
  return photoVariantUrl(src, width)
}
