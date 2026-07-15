import { NextResponse } from 'next/server'
import cloudinary from 'cloudinary'

cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Convert File to base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataUri = `data:${file.type};base64,${base64}`

    const result = await cloudinary.v2.uploader.upload(dataUri, {
      folder: 'asehanta/listings',
      // TODO: Add image transformations if needed
      // transformation: [{ width: 1200, height: 800, crop: 'limit' }],
    })

    return NextResponse.json({ url: result.secure_url, public_id: result.public_id })
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
