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
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { url, listing_id } = await req.json()
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

    if (listing_id) {
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
    }

    const parts = url.split('/')
    const filename = parts[parts.length - 1]
    const publicId = filename.substring(0, filename.lastIndexOf('.')) || filename

    await cloudinary.v2.uploader.destroy(`asehanta/listings/${publicId}`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
