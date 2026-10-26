import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@/lib/supabase/server'

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT!,
  region: process.env.R2_REGION!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET!

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

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name') || 'video.mp4'
    const ext = (name.split('.').pop() || '').toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Unsupported format .${ext}` }, { status: 400 })
    }

    const key = `listings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const contentType = mimeFromName(name)

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`

    return NextResponse.json({ key, uploadUrl, publicUrl, contentType })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to get upload info' }, { status: 500 })
  }
}
