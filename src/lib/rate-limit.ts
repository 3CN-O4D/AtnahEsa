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

    if (error || !data) return { allowed: true, remaining: max, retryAfter: 0 }

    const row = Array.isArray(data) ? data[0] : data
    const allowed = row?.allowed !== false
    const remaining = typeof row?.remaining === 'number' ? row.remaining : max
    const retryAfter = typeof row?.retry_after_seconds === 'number' ? row.retry_after_seconds : windowSeconds

    return { allowed, remaining, retryAfter }
  } catch {
    return { allowed: true, remaining: max, retryAfter: 0 }
  }
}
