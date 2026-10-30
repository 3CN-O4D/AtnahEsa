import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_SIZE,
  VIDEO_UPLOAD_EXPIRY,
  extFromName,
  generateImageKey,
  imageMimeFromName,
  isSupportedImageExt,
  presignPut,
} from '@/lib/s3'

const HEIC_MESSAGE =
  'HEIC/HEIF photos are not supported by browsers. On iPhone use Settings → Camera → Formats → Most Compatible, or export the photo as JPG.'

export async function GET(req: Request) {
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

    if (!process.env.R2_PUBLIC_URL || !process.env.R2_BUCKET || !process.env.R2_ENDPOINT) {
      console.error('[upload/info] R2 environment is incomplete')
      return addSecurityHeaders(NextResponse.json({ error: 'Image storage is not configured.' }, { status: 503 }))
    }

    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name') || 'photo.jpg'
    const ext = extFromName(name)
    const normalized = ext === 'jpeg' ? 'jpg' : ext

    if (ext === 'heic' || ext === 'heif') {
      return addSecurityHeaders(NextResponse.json({ error: HEIC_MESSAGE }, { status: 415 }))
    }

    if (!isSupportedImageExt(ext)) {
      return addSecurityHeaders(NextResponse.json(
        {
          error: `Unsupported image format${ext ? ` (.${ext})` : ''}. Please use ${IMAGE_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')}.`,
        },
        { status: 400 }
      ))
    }

    const sizeHint = parseInt(searchParams.get('content-length') || '', 10)
    if (Number.isFinite(sizeHint) && sizeHint > MAX_IMAGE_SIZE) {
      return addSecurityHeaders(NextResponse.json(
        { error: 'Images must be 10MB or smaller.' },
        { status: 413 }
      ))
    }

    const rawIndex = parseInt(searchParams.get('index') || '', 10)
    const index = Number.isFinite(rawIndex) ? rawIndex : 0

    const contentType = imageMimeFromName(name)
    const key = generateImageKey(user.id, normalized, index)
    const uploadUrl = await presignPut(key, contentType)
    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`

    return addSecurityHeaders(NextResponse.json({
      key,
      uploadUrl,
      publicUrl,
      contentType,
      maxSize: MAX_IMAGE_SIZE,
      expiresIn: VIDEO_UPLOAD_EXPIRY,
    }))
  } catch (err) {
    console.error('[upload/info] failed to prepare upload', err)
    return addSecurityHeaders(NextResponse.json(
      { error: 'Could not prepare the image upload. Please retry.' },
      { status: 500 }
    ))
  }
}
