import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import {
  MAX_VIDEO_SIZE,
  VIDEO_EXTENSIONS,
  VIDEO_UPLOAD_EXPIRY,
  extFromName,
  generateVideoKey,
  isSupportedVideoExt,
  mimeFromName,
  presignPut,
} from '@/lib/s3'

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
      return addSecurityHeaders(NextResponse.json({ error: 'Please sign in to upload videos.' }, { status: 401 }))
    }

    if (!process.env.R2_PUBLIC_URL || !process.env.R2_BUCKET || !process.env.R2_ENDPOINT) {
      console.error('[upload-video] R2 environment is incomplete')
      return addSecurityHeaders(NextResponse.json({ error: 'Video storage is not configured.' }, { status: 503 }))
    }

    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name') || 'video.mp4'
    const ext = extFromName(name)

    if (!isSupportedVideoExt(ext)) {
      return addSecurityHeaders(NextResponse.json(
        {
          error: `Unsupported video format${ext ? ` (.${ext})` : ''}. Please upload ${VIDEO_EXTENSIONS.map((e) => `.${e}`).join(', ')}.`,
        },
        { status: 400 }
      ))
    }

    const sizeHint = parseInt(searchParams.get('content-length') || '', 10)
    if (Number.isFinite(sizeHint) && sizeHint > MAX_VIDEO_SIZE) {
      return addSecurityHeaders(NextResponse.json(
        { error: `Video is too large. Maximum size is ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024)}MB.` },
        { status: 413 }
      ))
    }

    const contentType = mimeFromName(name)
    const key = generateVideoKey(ext)
    const uploadUrl = await presignPut(key, contentType)
    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`

    return addSecurityHeaders(NextResponse.json({
      key,
      uploadUrl,
      publicUrl,
      contentType,
      maxSize: MAX_VIDEO_SIZE,
      expiresIn: VIDEO_UPLOAD_EXPIRY,
    }))
  } catch (err) {
    console.error('[upload-video] failed to prepare upload', err)
    return addSecurityHeaders(NextResponse.json(
      { error: 'Could not prepare the video upload. Please retry.' },
      { status: 500 }
    ))
  }
}
