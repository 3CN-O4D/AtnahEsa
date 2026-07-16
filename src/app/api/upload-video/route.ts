import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('video/')) {
      return NextResponse.json({ error: 'Only video files allowed' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Video must be under 50MB' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()
    const key = `listings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const bytes = await file.arrayBuffer()
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: file.type,
    }))

    const publicUrl = `${process.env.S3_ENDPOINT}/${BUCKET}/${key}`

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}
