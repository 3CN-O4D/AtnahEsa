import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import { R2_BUCKET, R2_PUBLIC_URL, r2Client, validateImageKey } from '@/lib/s3'
import { IMAGE_VARIANT_WIDTHS, variantKey } from '@/lib/image-src'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Optimise a listing photo after the browser has PUT the raw file to R2.
 *
 * The uploader uploads the original directly (phone photos exceed Vercel's
 * request-body limit), then calls this endpoint once. We re-encode a WebP
 * master capped at 2000px and write 480/640/960/1280/1920 variants next to it, so
 * every page view can be served straight from R2's CDN — no Vercel image
 * optimizations, no on-demand resizing.
 *
 * The original is deleted once the master is in place. If this endpoint fails,
 * the uploader keeps the original URL and the site still works (the loader
 * falls back to the full-size file).
 */

const MAX_BYTES = 25 * 1024 * 1024
const MASTER_MAX_EDGE = 2000
const MASTER_QUALITY = 82
const VARIANT_QUALITY = 78

function masterKeyFor(key: string): string {
  return /\.webp$/i.test(key) ? key : `${key.replace(/\.[a-z0-9]+$/i, '')}.webp`
}

async function encode(input: Buffer, width: number | null, quality: number): Promise<Buffer> {
  let pipeline = sharp(input, { failOn: 'none' }).rotate()
  if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true })
  else pipeline = pipeline.resize({ width: MASTER_MAX_EDGE, height: MASTER_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
  return pipeline.webp({ quality, effort: 4 }).toBuffer()
}

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'upload')
  if (!allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Too many uploads. Please wait a moment and try again.' }, { status: 429, headers })
    )
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return addSecurityHeaders(NextResponse.json({ error: 'Please sign in to upload images.' }, { status: 401 }))
    }

    if (!R2_BUCKET || !R2_PUBLIC_URL) {
      return addSecurityHeaders(NextResponse.json({ error: 'Image storage is not configured.' }, { status: 503 }))
    }

    const body = await req.json().catch(() => ({}))
    const key = typeof body?.key === 'string' ? body.key : ''
    if (!key || !validateImageKey(key) || !key.startsWith(`asehanta/listings/${user.id}/`)) {
      return addSecurityHeaders(NextResponse.json({ error: 'Unknown upload.' }, { status: 403 }))
    }

    const s3 = r2Client()
    const object = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    if (!object.Body) {
      return addSecurityHeaders(NextResponse.json({ error: 'The uploaded image could not be read.' }, { status: 502 }))
    }

    const bytes = Buffer.from(await object.Body.transformToByteArray())
    if (!bytes.length || bytes.length > MAX_BYTES) {
      return addSecurityHeaders(NextResponse.json({ error: 'That image is too large to process.' }, { status: 413 }))
    }

    const meta = await sharp(bytes, { failOn: 'none' }).metadata().catch(() => null)
    if (!meta?.width || !meta?.height) {
      return addSecurityHeaders(NextResponse.json({ error: 'That file is not a readable image.' }, { status: 415 }))
    }

    const masterKey = masterKeyFor(key)
    const master = await encode(bytes, null, MASTER_QUALITY)
    const variants = await Promise.all(
      IMAGE_VARIANT_WIDTHS.map(async (width) => ({
        key: variantKey(key, width),
        body: await encode(bytes, width, VARIANT_QUALITY),
      }))
    )

    const put = (target: string, buffer: Buffer) =>
      s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: target,
          Body: buffer,
          ContentType: 'image/webp',
          ContentDisposition: 'inline',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      )

    await Promise.all([put(masterKey, master), ...variants.map((variant) => put(variant.key, variant.body))])

    if (masterKey !== key) {
      await s3
        .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
        .catch((err) => console.error('[upload/finalize] could not delete original', { key, err }))
    }

    return addSecurityHeaders(
      NextResponse.json({
        url: `${R2_PUBLIC_URL}/${masterKey}`,
        key: masterKey,
        width: meta.width,
        height: meta.height,
        variants: IMAGE_VARIANT_WIDTHS,
        bytes: master.length,
      })
    )
  } catch (err) {
    console.error('[upload/finalize] failed', err)
    return addSecurityHeaders(
      NextResponse.json({ error: 'Could not optimise the image. The original was kept.' }, { status: 500 })
    )
  }
}
