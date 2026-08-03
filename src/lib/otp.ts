import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_OTP_ATTEMPTS = 5

type OtpRow = {
  id: string
  attempts?: number
  used?: boolean
  expires_at?: string
}

export async function findValidOtp(
  admin: SupabaseClient,
  email: string,
  otp: string,
  types: string[]
): Promise<OtpRow | null> {
  const { data } = await admin
    .from('otps')
    .select('*')
    .eq('email', email)
    .eq('otp', otp)
    .in('type', types)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .maybeSingle()

  return data || null
}

export async function recordOtpFailure(
  admin: SupabaseClient,
  email: string,
  types: string[]
): Promise<void> {
  try {
    const { data: active } = await admin
      .from('otps')
      .select('*')
      .eq('email', email)
      .in('type', types)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())

    if (!active || active.length === 0) return

    for (const row of active as OtpRow[]) {
      const attempts = (row.attempts ?? 0) + 1
      await admin
        .from('otps')
        .update(attempts >= MAX_OTP_ATTEMPTS ? { used: true } : { attempts })
        .eq('id', row.id)
    }
  } catch (err) {
    console.error('recordOtpFailure failed:', err)
  }
}
