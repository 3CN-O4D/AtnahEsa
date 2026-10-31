import cloudinary from 'cloudinary'
import { deleteR2Object, r2KeyFromUrl } from '@/lib/s3'

cloudinary.v2.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/** Pull the Cloudinary public id out of a delivery URL, if it is one. */
export function cloudinaryPublicId(url: string): string | null {
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

/**
 * Best-effort delete of one listing media object. Returns whether the URL
 * pointed at a storage provider we manage (so the caller knows the listing's
 * media column can be cleared).
 */
export async function deleteMediaUrl(url: string): Promise<boolean> {
  if (typeof url !== 'string' || !url) return false

  // R2-hosted listing photos / videos
  const r2Key = r2KeyFromUrl(url)
  if (r2Key) {
    try {
      await deleteR2Object(r2Key)
    } catch (err) {
      console.error('[media] R2 delete failed', { key: r2Key, err })
    }
    return true
  }

  // Cloudinary-hosted legacy photos
  const publicId = cloudinaryPublicId(url)
  if (publicId) {
    try {
      await cloudinary.v2.uploader.destroy(publicId)
    } catch (err) {
      console.error('[media] Cloudinary delete failed', { publicId, err })
    }
    return true
  }

  return false
}
