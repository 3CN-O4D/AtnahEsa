import { NextResponse } from 'next/server'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

export async function POST(req: Request) {
  try {
    const { bucket, key } = await req.json()
    
    if (!bucket || !key) {
      return NextResponse.json({ error: 'Missing bucket or key' }, { status: 400 })
    }

    const s3 = new S3Client({
      endpoint: process.env.R2_ENDPOINT!,
      region: 'auto',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    })

    await s3.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('R2 delete error:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
