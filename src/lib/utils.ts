export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatPrice(price: number): string {
  return `KSh ${price.toLocaleString()}`
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return phone
  return digits.slice(0, 4) + '****' + digits.slice(-4)
}

/**
 * Turn a stored video URL into something a browser can play.
 *
 * Videos uploaded through the app are served through our own streaming route
 * (`/api/video`) instead of the raw Supabase S3 URL, which keeps playback
 * fast and avoids CORS surprises. Everything else is passed through.
 */
export function resolveVideoSrc(url: string): string {
  if (url.startsWith('https://') && url.includes('/storage/v1/s3/')) {
    const parts = url.split('/storage/v1/s3/')
    if (parts[1]) return `/api/video?key=${encodeURIComponent(parts[1].replace(/^[^/]+\//, ''))}`
  }
  return url
}

/**
 * Pull the 11-character video id out of any YouTube URL we accept.
 * Covers watch links, youtu.be, /embed, /v and /shorts.
 */
export function youTubeVideoId(url: string): string | null {
  const match = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )
  return match?.[1] || null
}

/** Pull the numeric id out of a TikTok video/photo URL. */
export function tikTokVideoId(url: string): string | null {
  const match = String(url || '').match(
    /tiktok\.com\/(?:@[^/]+\/(?:video|photo)\/|embed\/(?:v2\/)?|v\/)(\d+)/
  )
  return match?.[1] || null
}

export function normalizeTikTokUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('tiktok.com')) return url
    
    // Extract video ID from various TikTok URL formats
    // https://www.tiktok.com/@username/video/1234567890
    // https://www.tiktok.com/@username/video/1234567890?param=value
    // https://vm.tiktok.com/ABC123/
    const videoMatch = parsed.pathname.match(/\/video\/(\d+)/)
    if (videoMatch) {
      return `https://www.tiktok.com/video/${videoMatch[1]}`
    }
    
    // Short URL format: vm.tiktok.com/ABC123
    const shortMatch = parsed.pathname.match(/^\/([A-Za-z0-9]+)\/?$/)
    if (shortMatch && parsed.hostname === 'vm.tiktok.com') {
      return `https://vm.tiktok.com/${shortMatch[1]}/`
    }
    
    // Return clean URL without query params
    return `https://${parsed.hostname}${parsed.pathname}`
  } catch {
    return url
  }
}
