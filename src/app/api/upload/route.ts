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

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'upload')
  if (!allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429, headers })

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const index = parseInt(formData.get('index') as string || '0', 10)

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Max 10MB' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).slice(2, 8)
    const key = `asehanta/listings/${user.id}/${Date.now().toString(36)}-${random}-${index}.${ext}`

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: `asehanta/listings/${user.id}/${key}`,
      Body: buffer,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable',
    }))

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`
    return NextResponse.json({ url: publicUrl, key })
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
