/**
 * Image delivery helpers.
 *
 * Listing photos live in Cloudflare R2 at camera resolution (often 3 MB+).
 * Rather than paying Vercel's per-transformation image optimizer, every photo
 * gets pre-generated WebP variants written next to it in the bucket:
 *
 *   photo-0.jpg  ->  photo-0-480.webp
 *                    photo-0-640.webp
 *                    photo-0-960.webp
 *                    photo-0-1280.webp
 *                    photo-0-1920.webp
 *
 * New uploads produce them in `api/upload/finalize`; `scripts/optimize-r2-images.mjs`
 * backfills older photos. This module maps a rendered width onto the closest
 * variant so the browser downloads only what it needs, straight from R2's CDN.
 */

/** Widths we store for every listing photo. Keep in sync with the upload. */
export const IMAGE_VARIANT_WIDTHS = [480, 640, 960, 1280, 1920] as const

/** Everything at or below this is served as-is (icons, avatars, thumbs). */
const R2_PUBLIC_HOST = (() => {
  const raw = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  if (!raw) return 'media.asehanta.com'
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return 'media.asehanta.com'
  }
})()

/**
 * Rendering widths that match the variant set, used by next/image `sizes`.
 * Keep in sync with `imageSizes`/`deviceSizes` in next.config.ts.
 */
export const CARD_IMAGE_SIZES = '(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw'
export const HERO_IMAGE_SIZES = '(min-width: 1200px) 1152px, 100vw'

const VARIANT_RE = /-(480|640|960|1280|1600|1920)\.webp$/i

export function listingPhotoKey(src: string): string | null {
  if (!/^https?:\/\//i.test(src)) return null
  try {
    const url = new URL(src)
    const host = url.hostname.toLowerCase()
    const isR2 = host === R2_PUBLIC_HOST || host === 'media.asehanta.com' || /\.r2\.dev$/i.test(host)
    if (!isR2) return null
    // Only listing photos get variants; avatars and movers are left alone.
    if (!url.pathname.includes('/asehanta/listings/')) return null
    if (VARIANT_RE.test(url.pathname)) return null
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  } catch {
    return null
  }
}

/** Public URL for one pre-generated variant of a listing photo. */
export function variantKey(key: string, width: number): string {
  const dot = key.lastIndexOf('.')
  const base = dot === -1 ? key : key.slice(0, dot)
  return `${base}-${width}.webp`
}

/** Closest stored variant at or above the requested width (never upscales past 1920). */
export function variantWidthFor(width: number): number {
  const target = Math.max(1, Math.round(width) || 480)
  return IMAGE_VARIANT_WIDTHS.find((w) => w >= target) ?? IMAGE_VARIANT_WIDTHS[IMAGE_VARIANT_WIDTHS.length - 1]
}

export function photoVariantUrl(src: string, width: number): string {
  const key = listingPhotoKey(src)
  if (!key) return src
  const origin = new URL(src).origin
  return `${origin}/${variantKey(key, variantWidthFor(width))}`
}
