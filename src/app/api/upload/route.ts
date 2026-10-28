import { NextResponse } from 'next/server'
import cloudinary from 'cloudinary'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'

cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'upload')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many uploads. Try again shortly.' }, { status: 429, headers })
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addSecurityHeaders(resp)
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      const resp = NextResponse.json({ error: 'No file provided' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      const resp = NextResponse.json({ error: 'Only JPEG, PNG, WebP, and AVIF images are allowed' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    if (file.size > MAX_SIZE) {
      const resp = NextResponse.json({ error: 'Image must be under 10MB' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    // Sanitize filename
    const originalName = file.name
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.+/g, '.').slice(0, 255)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataUri = `data:${file.type};base64,${base64}`

    const result = await cloudinary.v2.uploader.upload(dataUri, {
      folder: 'asehanta/listings',
      public_id: `asehanta-${Date.now()}-${safeName.replace(/\.[^.]+$/, '')}`,
      resource_type: 'image',
    })

    const resp = NextResponse.json({ url: result.secure_url, public_id: result.public_id })
    return addSecurityHeaders(resp)
  } catch {
    const resp = NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    return addSecurityHeaders(resp)
  }
}
