import { NextResponse } from 'next/server'
import cloudinary from 'cloudinary'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'

cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'upload')
  if (!allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429, headers })

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return addSecurityHeaders(NextResponse.json({ error: 'No file' }, { status: 400 }))
    if (!ALLOWED_TYPES.includes(file.type)) return addSecurityHeaders(NextResponse.json({ error: 'Invalid type' }, { status: 400 }))
    if (file.size > MAX_SIZE) return addSecurityHeaders(NextResponse.json({ error: 'Max 5MB' }, { status: 400 }))

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataUri = `data:${file.type};base64,${base64}`

    const result = await cloudinary.v2.uploader.upload(dataUri, {
      folder: 'asehanta/avatars',
      public_id: `avatar-${user.id}-${Date.now()}`,
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
    })

    await supabase.from('profiles').update({ avatar_url: result.secure_url }).eq('id', user.id)

    return addSecurityHeaders(NextResponse.json({ url: result.secure_url }))
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Upload failed' }, { status: 500 }))
  }
}
