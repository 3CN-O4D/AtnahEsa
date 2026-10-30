import { NextResponse } from 'next/server'
import cloudinary from 'cloudinary'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteR2Object, r2KeyFromUrl } from '@/lib/s3'

cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

function cloudinaryPublicId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'res.cloudinary.com') return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    // /<cloud>/image/upload/<version?>/<public_id>.<ext>
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
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { url, listing_id } = await req.json()
    if (typeof url !== 'string' || !url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
    if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

    const { data: listing } = await supabase
      .from('listings')
      .select('uploader_id')
      .eq('id', listing_id)
      .single()
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (listing.uploader_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Storage objects can be shared (e.g. a URL reused by another listing), so
    // never delete one that is still referenced elsewhere.
    const admin = createAdminClient()
    const { data: otherRefs } = await admin
      .from('listings')
      .select('id')
      .neq('id', listing_id)
      .contains('images', [url])
      .limit(1)
    if (otherRefs && otherRefs.length > 0) {
      return NextResponse.json({ success: true, skipped: 'still-referenced' })
    }

    // R2-hosted listing photos
    const r2Key = r2KeyFromUrl(url)
    if (r2Key) {
      try {
        await deleteR2Object(r2Key)
      } catch (err) {
        console.error('[delete-image] R2 delete failed', { key: r2Key, err })
        return NextResponse.json({ error: 'Could not delete the image from storage.' }, { status: 502 })
      }
      return NextResponse.json({ success: true })
    }

    // Cloudinary-hosted legacy photos
    const publicId = cloudinaryPublicId(url)
    if (publicId) {
      const result = await cloudinary.v2.uploader.destroy(publicId).catch((err) => {
        console.error('[delete-image] Cloudinary destroy failed', { publicId, err })
        return null
      })
      if (!result) {
        return NextResponse.json({ error: 'Could not delete the image from storage.' }, { status: 502 })
      }
      return NextResponse.json({ success: true })
    }

    // External URLs (YouTube thumbnails etc.) are not ours to delete.
    return NextResponse.json({ success: true, skipped: 'external' })
  } catch (err) {
    console.error('[delete-image] unexpected failure', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
