import { createAdminClient } from '@/lib/supabase/admin'

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-vercel-forwarded-for') ||
    'unknown'
  )
}

const memoryStore = new Map<string, { count: number; resetAt: number }>()

export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds = 60
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('rate_limit_check', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    })

    if (error || !data) {
      // Fallback to in-memory rate limiting
      return checkMemoryRateLimit(key, max, windowSeconds)
    }

    const row = Array.isArray(data) ? data[0] : data
    const allowed = row?.allowed !== false
    const remaining = typeof row?.remaining === 'number' ? row.remaining : max
    const retryAfter = typeof row?.retry_after_seconds === 'number' ? row.retry_after_seconds : windowSeconds

    return { allowed, remaining, retryAfter }
  } catch {
    return checkMemoryRateLimit(key, max, windowSeconds)
  }
}

function checkMemoryRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now()
  const entry = memoryStore.get(key)

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { allowed: true, remaining: max - 1, retryAfter: windowSeconds }
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { allowed: true, remaining: max - entry.count, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
}

export function createRateLimitHeaders(
  result: { allowed: boolean; remaining: number; retryAfter: number }
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.remaining + (result.allowed ? 1 : 0)),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + result.retryAfter),
    'Retry-After': String(result.retryAfter),
  }
}

export const RATE_LIMITS = {
  auth: { max: 10, window: 60 },
  api: { max: 100, window: 60 },
  upload: { max: 60, window: 60 },
  payments: { max: 30, window: 60 },
  search: { max: 60, window: 60 },
  contact: { max: 5, window: 300 },
  otp: { max: 3, window: 300 },
} as const
