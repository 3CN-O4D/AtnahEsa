import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name') || 'video.mp4'
    const type = searchParams.get('type') || 'video/mp4'

    if (!type.startsWith('video/')) {
      return NextResponse.json({ error: 'Only video files allowed' }, { status: 400 })
    }

    const ext = name.split('.').pop()
    const key = `listings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: type,
    })

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
    const publicUrl = `${process.env.S3_ENDPOINT}/${BUCKET}/${key}`

    return NextResponse.json({ url: signedUrl, publicUrl, key })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate upload URL' }, { status: 500 })
  }
}