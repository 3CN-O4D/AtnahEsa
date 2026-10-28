import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
})

const BUCKET = process.env.S3_BUCKET!

const EXT_MIME: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska', m4v: 'video/mp4',
  ogv: 'video/ogg', '3gp': 'video/3gpp',
}

const ALLOWED_EXTENSIONS = Object.keys(EXT_MIME)
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB

function generateVideoKey(userId: string, ext: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `listings/${userId}/${timestamp}-${random}.${ext}`
}

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'upload')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many uploads. Try again shortly.' }, { status: 429, headers })
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addSecurityHeaders(resp)
    }

    const { searchParams } = new URL(req.url)
    const fileName = searchParams.get('name') || 'video.mp4'
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      const resp = NextResponse.json({ error: `Unsupported format .${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    const contentType = req.headers.get('content-type') || EXT_MIME[ext]

    const bytes = await req.arrayBuffer()
    if (!bytes.byteLength) {
      const resp = NextResponse.json({ error: 'No file provided' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    if (bytes.byteLength > MAX_VIDEO_SIZE) {
      const resp = NextResponse.json({ error: 'Video must be under 100MB' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    // Generate secure key without original filename
    const key = generateVideoKey(user.id, ext)

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: contentType,
    }))

    const projectRef = process.env.S3_ENDPOINT!.match(/https?:\/\/([^.]+)/)?.[1] || ''
    const publicUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/${BUCKET}/${key}`

    const resp = NextResponse.json({ url: publicUrl })
    return addSecurityHeaders(resp)
  } catch (err) {
    const resp = NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
    return addSecurityHeaders(resp)
  }
}
