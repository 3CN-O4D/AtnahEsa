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
