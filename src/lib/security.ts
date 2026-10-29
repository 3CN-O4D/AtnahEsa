import { z } from 'zod'
import { NextResponse } from 'next/server'
import { RATE_LIMITS, checkRateLimit, createRateLimitHeaders, getClientIp } from '@/lib/rate-limit'

export const VALIDATION_SCHEMAS = {
  listingCreate: z.object({
    title: z.string().min(3).max(100),
    description: z.string().min(20).max(5000),
    price: z.number().int().min(300).max(10000000),
    rent: z.number().int().min(0).max(10000000),
    deposit: z.number().int().min(0).max(10000000).optional(),
    deposit_refundable: z.boolean().optional(),
    location: z.string().min(2).max(100),
    descriptive_location: z.string().max(500).optional(),
    images: z.array(z.string().url()).max(10),
    youtube_url: z.string().url().optional().nullable(),
    tiktok_url: z.string().url().optional().nullable(),
    video_urls: z.array(z.string().url()).max(5).optional(),
    issues: z.array(z.string()).max(10).optional(),
    issues_count: z.number().int().min(0).max(10).optional(),
    house_type: z.string().max(50).optional(),
    building_type: z.enum(['', 'storey', 'flat']).optional(),
    floor_number: z.string().max(20).optional(),
    payment_method: z.string().max(100).optional(),
    vacancy: z.enum(['pending', 'vacant']).optional(),
    why_vacant: z.string().max(500).optional(),
    electric_bill: z.string().max(200).optional(),
    water: z.string().max(200).optional(),
    lister_phone: z.string().max(30).optional(),
  }),

  listingUpdate: z.object({
    title: z.string().min(3).max(100).optional(),
    description: z.string().min(20).max(5000).optional(),
    price: z.number().int().min(300).max(10000000).optional(),
    rent: z.number().int().min(0).max(10000000).optional(),
    deposit: z.number().int().min(0).max(10000000).optional(),
    deposit_refundable: z.boolean().optional(),
    location: z.string().min(2).max(100).optional(),
    descriptive_location: z.string().max(500).optional(),
    images: z.array(z.string().url()).max(10).optional(),
    youtube_url: z.string().url().optional().nullable(),
    tiktok_url: z.string().url().optional().nullable(),
    video_urls: z.array(z.string().url()).max(5).optional(),
    issues: z.array(z.string()).max(10).optional(),
    issues_count: z.number().int().min(0).max(10).optional(),
    house_type: z.string().max(50).optional(),
    building_type: z.enum(['', 'storey', 'flat']).optional(),
    floor_number: z.string().max(20).optional(),
    payment_method: z.string().max(100).optional(),
    vacancy: z.enum(['pending', 'vacant']).optional(),
    why_vacant: z.string().max(500).optional(),
    electric_bill: z.string().max(200).optional(),
    water: z.string().max(200).optional(),
    lister_phone: z.string().max(30).optional(),
    status: z.enum(['pending', 'published', 'booked', 'taken', 'rejected']).optional(),
  }),

  bookingCreate: z.object({
    listing_id: z.string().uuid(),
    phone: z.string().regex(/^(\+254|07|01)\d{8}$/),
    amount: z.number().int().min(1),
    name: z.string().min(2).max(100).optional(),
    area: z.string().max(100).optional(),
    id_number: z.string().max(20).optional(),
    listing_location: z.string().max(100).optional(),
    listing_price: z.number().int().min(0).optional(),
  }),

  contactSubmit: z.object({
    name: z.string().min(2).max(100),
    phone: z.string().regex(/^(\+254|07|01)\d{8}$/),
    email: z.string().email(),
    id_number: z.string().max(20),
    location: z.string().min(2).max(100),
    message: z.string().max(2000).optional(),
  }),

  searchQuery: z.object({
    query: z.string().max(100).optional(),
    sort: z.enum(['rent_asc', 'rent_desc', 'price_asc', 'price_desc', 'location', 'issues_asc', 'issues_desc']).optional(),
    location: z.string().max(100).optional(),
    minRent: z.string().regex(/^\d+$/).optional(),
    maxRent: z.string().regex(/^\d+$/).optional(),
    minPrice: z.string().regex(/^\d+$/).optional(),
    maxPrice: z.string().regex(/^\d+$/).optional(),
    issues: z.string().regex(/^\d+$/).optional(),
    page: z.string().regex(/^\d+$/).optional(),
    status: z.enum(['published', 'taken', 'booked', 'all']).optional(),
    count: z.string().optional(),
  }),

  profileUpdate: z.object({
    full_name: z.string().min(2).max(100).optional(),
    phone: z.string().regex(/^(\+254|07|01)\d{8}$/).optional(),
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
    avatar_url: z.string().url().optional().nullable(),
  }),

  otpVerify: z.object({
    email: z.string().email(),
    otp: z.string().length(6).regex(/^\d+$/),
    type: z.enum(['signup', 'password_reset']),
  }),

  passwordReset: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
    otp: z.string().length(6).regex(/^\d+$/),
  }),

  moversCreate: z.object({
    name: z.string().min(2).max(100),
    description: z.string().min(10).max(2000),
    price: z.number().int().min(100).max(1000000),
    location: z.string().min(2).max(100),
    phone: z.string().regex(/^(\+254|07|01)\d{8}$/),
    image: z.string().url().optional().nullable(),
  }),

  wifiPackageCreate: z.object({
    name: z.string().min(2).max(100),
    provider: z.string().min(2).max(50),
    speed: z.string().min(2).max(50),
    price: z.number().int().min(100).max(100000),
    description: z.string().min(10).max(2000),
    features: z.array(z.string()).max(10).optional(),
    original_price: z.number().int().min(0).optional(),
    category: z.string().max(50).optional(),
  }),

  flaggedReport: z.object({
    reporter_email: z.string().email().optional(),
    target_type: z.enum(['listing', 'mover', 'user']),
    target_id: z.string().min(1).max(100),
    target_title: z.string().max(200).optional(),
    reason: z.string().min(5).max(200),
    description: z.string().min(10).max(2000),
  }),
} as const

export function validateRequest<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: NextResponse } {
  const result = schema.safeParse(data)
  if (!result.success) {
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten().fieldErrors },
        { status: 400 }
      ),
    }
  }
  return { success: true, data: result.data }
}

export async function withRateLimit(
  req: Request,
  limitType: keyof typeof RATE_LIMITS,
  customKey?: string
): Promise<{ allowed: boolean; headers: Record<string, string>; retryAfter?: number }> {
  const key = customKey || `ip:${getClientIp(req)}:${limitType}`
  const { max, window } = RATE_LIMITS[limitType]
  const result = await checkRateLimit(key, max, window)
  const headers = createRateLimitHeaders(result)

  if (!result.allowed) {
    return { allowed: false, headers, retryAfter: result.retryAfter }
  }

  return { allowed: true, headers }
}

export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

export function sanitizeForSearch(input: string): string {
  return input
    .replace(/[%_]/g, '')
    .trim()
    .slice(0, 100)
}

export function validateKenyanPhone(phone: string): string | null {
  const normalized = phone.replace(/\s+/g, '')
  const patterns = [
    /^\+254[17]\d{8}$/,
    /^0[17]\d{8}$/,
    /^254[17]\d{8}$/,
  ]
  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      return normalized.startsWith('+') ? normalized : `+${normalized}`
    }
  }
  return null
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.+/g, '.')
    .slice(0, 255)
}

export const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const

export function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}