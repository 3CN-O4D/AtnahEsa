import { NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

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
    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    const { Body, ContentType, ContentLength } = await s3.send(command)
    if (!Body) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const stream = Body as ReadableStream
    return new NextResponse(stream, {
      headers: {
        'Content-Type': ContentType || 'video/mp4',
        'Content-Length': String(ContentLength || ''),
        'Content-Disposition': 'inline',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }
}