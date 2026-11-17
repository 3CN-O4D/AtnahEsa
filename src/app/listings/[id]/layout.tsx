import type { ReactNode } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { HERO_IMAGE_SIZES, photoVariantUrl } from '@/lib/image-src'

/**
 * The detail page body is client-rendered, so the hero photo would only start
 * downloading after the listing fetch + hydration. Emitting a preload for the
 * first photo here means the bytes are already in cache by the time the hero
 * actually renders — the image appears the instant the text does.
 */
export default async function ListingLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const preload = await preloadHeroImage(id)
  return (
    <>
      {preload && (
        <link
          rel="preload"
          as="image"
          href={preload.href}
          imageSrcSet={preload.srcset}
          imageSizes={HERO_IMAGE_SIZES}
        />
      )}
      {children}
    </>
  )
}

/** Widths next/image will emit in the hero's srcset (imageSizes + deviceSizes). */
const HERO_SRCSET_WIDTHS = [48, 96, 128, 256, 384, 480, 640, 960, 1280, 1920]

async function preloadHeroImage(id: string): Promise<{ href: string; srcset: string } | null> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('listings')
      .select('images')
      .eq('id', id)
      .maybeSingle()
    if (error || !data || !Array.isArray(data.images) || data.images.length === 0) return null

    const first = data.images[0] as string
    const srcset = HERO_SRCSET_WIDTHS.map((width) => `${photoVariantUrl(first, width)} ${width}w`).join(', ')
    // Preload the size a phone hero actually needs; the srcset lets larger
    // screens re-resolve to a bigger variant when they render the same sizes.
    return { href: photoVariantUrl(first, 1280), srcset }
  } catch {
    return null
  }
}
