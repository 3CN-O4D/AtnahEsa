import { NextResponse } from 'next/server'
import cloudinary from 'cloudinary'
import { createClient } from '@/lib/supabase/server'
import { addSecurityHeaders } from '@/lib/security'
import { deleteR2Object, r2KeyFromUrl } from '@/lib/s3'

cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

function cloudinaryPublicId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'res.cloudinary.com') return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    const uploadIndex = parts.indexOf('upload')
    if (uploadIndex === -1) return null
    const afterUpload = parts.slice(uploadIndex + 1).filter((p) => !/^v\d+$/.test(p))
    if (!afterUpload.length) return null
    const withExt = afterUpload.join('/')
    return withExt.replace(/\.[a-z0-9]+$/i, '') || null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const { url } = await req.json()
    if (typeof url !== 'string' || !url) {
      return addSecurityHeaders(NextResponse.json({ error: 'No URL provided' }, { status: 400 }))
    }

    // Only allow deleting the user's own current avatar.
    const { data: profile } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
    if (!profile || profile.avatar_url !== url) {
      return addSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    }

    const r2Key = r2KeyFromUrl(url)
    if (r2Key) {
      try {
        await deleteR2Object(r2Key)
      } catch (err) {
        console.error('[delete-avatar] R2 delete failed', { key: r2Key, err })
        return addSecurityHeaders(NextResponse.json({ error: 'Could not delete the image from storage.' }, { status: 502 }))
      }
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
      return addSecurityHeaders(NextResponse.json({ success: true }))
    }

    const publicId = cloudinaryPublicId(url)
    if (publicId) {
      const result = await cloudinary.v2.uploader.destroy(publicId).catch((err) => {
        console.error('[delete-avatar] Cloudinary destroy failed', { publicId, err })
        return null
      })
      if (!result) {
        return addSecurityHeaders(NextResponse.json({ error: 'Could not delete the image from storage.' }, { status: 502 }))
      }
    }

    await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
    return addSecurityHeaders(NextResponse.json({ success: true }))
  } catch (err) {
    console.error('[delete-avatar] unexpected failure', err)
    return addSecurityHeaders(NextResponse.json({ error: 'Delete failed' }, { status: 500 }))
  }
}
