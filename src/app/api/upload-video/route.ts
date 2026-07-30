import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@/lib/supabase/server'

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

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  return EXT_MIME[ext || ''] || 'video/mp4'
}

const ALLOWED_EXTENSIONS = Object.keys(EXT_MIME)

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const fileName = searchParams.get('name') || 'video.mp4'
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Unsupported format .${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 })
    }

    const contentType = req.headers.get('content-type') || mimeFromName(fileName)

    const bytes = await req.arrayBuffer()
    if (!bytes.byteLength) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const key = `listings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: contentType,
    }))

    const projectRef = process.env.S3_ENDPOINT!.match(/https?:\/\/([^.]+)/)?.[1] || ''
    const publicUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/${BUCKET}/${key}`

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}
