import { NextResponse } from 'next/server'
import cloudinary from 'cloudinary'
import { createClient } from '@/lib/supabase/server'

cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataUri = `data:${file.type};base64,${base64}`

    const result = await cloudinary.v2.uploader.upload(dataUri, {
      folder: 'asehanta/avatars',
      transformation: [{ width: 200, height: 200, crop: 'fill' }],
    })

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ avatar_url: result.secure_url, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    return NextResponse.json({ url: result.secure_url })
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
