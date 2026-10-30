import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT!,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
})

/**
 * The stored file extension is derived from the validated MIME type, never
 * from the original filename. That keeps the key, the returned URL and the
 * Content-Type header consistent even for names like "IMG_0001.JPG " or
 * files with no extension at all.
 */
const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_INDEX = 999

const EXT_MIME_HINT: Record<string, string> = {
  heic: 'HEIC/HEIF',
  heif: 'HEIC/HEIF',
  gif: 'GIF',
  bmp: 'BMP',
  tiff: 'TIFF',
}

function friendlyTypeError(type: string): string {
  if (!type) {
    return 'Could not detect this image format. Use JPG, PNG, WebP or AVIF.'
  }
  return `Unsupported image format (${type}). Use JPG, PNG, WebP or AVIF.`
}

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'upload')
  if (!allowed) {
    return addSecurityHeaders(NextResponse.json(
      { error: 'Too many uploads. Please wait a moment and try again.' },
      { status: 429, headers }
    ))
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return addSecurityHeaders(NextResponse.json({ error: 'Please sign in to upload images.' }, { status: 401 }))
    }

    if (!process.env.R2_PUBLIC_URL || !process.env.R2_BUCKET) {
      console.error('[upload] R2_PUBLIC_URL or R2_BUCKET is not configured')
      return addSecurityHeaders(NextResponse.json({ error: 'Image storage is not configured.' }, { status: 503 }))
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return addSecurityHeaders(NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 }))
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return addSecurityHeaders(NextResponse.json({ error: 'No image was included in the request.' }, { status: 400 }))
    }

    if (file.size === 0) {
      return addSecurityHeaders(NextResponse.json({ error: 'That file is empty.' }, { status: 400 }))
    }

    const ext = IMAGE_MIME_EXT[file.type]
    if (!ext) {
      const hinted = EXT_MIME_HINT[file.name.split('.').pop()?.toLowerCase() ?? '']
      return addSecurityHeaders(NextResponse.json(
        {
          error: hinted
            ? `${hinted} images are not supported yet. Please use JPG, PNG, WebP or AVIF.`
            : friendlyTypeError(file.type),
        },
        { status: 415 }
      ))
    }

    if (file.size > MAX_SIZE) {
      return addSecurityHeaders(NextResponse.json(
        { error: 'Images must be 10MB or smaller.' },
        { status: 413 }
      ))
    }

    const rawIndex = parseInt(formData.get('index') as string, 10)
    const index = Number.isFinite(rawIndex) ? Math.min(Math.max(rawIndex, 0), MAX_INDEX) : 0

    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).slice(2, 8)
    const key = `asehanta/listings/${user.id}/${timestamp}-${random}-${index}.${ext}`

    const bytes = await file.arrayBuffer()

    try {
      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: file.type,
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000, immutable',
      }))
    } catch (err) {
      console.error('[upload] R2 PutObject failed', { key, size: file.size, type: file.type, err })
      return addSecurityHeaders(NextResponse.json(
        { error: 'Could not save the image to storage. Please retry.' },
        { status: 502 }
      ))
    }

    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`

    return addSecurityHeaders(NextResponse.json({
      url: publicUrl,
      key,
      size: file.size,
      contentType: file.type,
    }))
  } catch (err) {
    console.error('[upload] unexpected failure', err)
    return addSecurityHeaders(NextResponse.json(
      { error: 'Image upload failed. Please retry.' },
      { status: 500 }
    ))
  }
}
