// =====================================================================
// TUMA (I&M Bank) PAYMENT — STK push with JWT auth
// Replaces the temporary M-Pesa / Daraja flow as the primary payment method.
//
// Docs (confirmed working via Python SDK test):
//   Auth:  POST https://api.tuma.co.ke/auth/token   { email, api_key }  -> data.token
//   STK:   POST https://api.tuma.co.ke/payment/stk-push                 { amount, phone, callback_url, description }
//
// Callback = flat JSON (NOT Daraja Body.stkCallback):
//   { status: "completed"|"failed", merchant_request_id, checkout_request_id,
//     result_code, result_desc, timestamp, mpesa_receipt_number, amount, failure_reason? }
//   result_code === 0  == success
// =====================================================================

const TUMA_AUTH_URL = 'https://api.tuma.co.ke/auth/token'
const TUMA_STK_URL = 'https://api.tuma.co.ke/payment/stk-push'

const EMAIL = process.env.TUMA_EMAIL || ''
const API_KEY = process.env.TUMA_API_KEY || ''
export const TUMA_CALLBACK_URL =
  process.env.TUMA_CALLBACK_URL || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://asehanta.com'}/api/payments/tuma-callback`

let cachedToken: { token: string; expires: number } | null = null

export interface TumaAuthResponse {
  success: boolean
  message?: string
  data?: { token?: string; shop?: { name?: string; email?: string } }
}

export interface TumaStkPushResponse {
  success: boolean
  message?: string
  data?: {
    merchant_request_id?: string
    checkout_request_id?: string
    customer_message?: string
  }
}

export interface TumaCallback {
  status: 'completed' | 'failed'
  merchant_request_id?: string
  checkout_request_id?: string
  result_code?: number
  result_desc?: string
  timestamp?: string
  mpesa_receipt_number?: string
  amount?: number
  failure_reason?: string
}

/**
 * Convert any Kenyan phone format to the Tuma API format (254XXXXXXXXX).
 * Handles: 0726498682, +254726498682, 254726498682, 0111272862, 254111272862,
 * and any mix of spaces or dashes (e.g. "0726-498-682", "+254 726 498 682").
 * Returns '' if the number is not a plausible Kenyan mobile number.
 */
export function normalizeKenyanPhone(phone: string): string {
  let p = phone.replace(/[\s\-()]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('254')) {
    p = p.slice(3)
  }
  if (p.startsWith('0')) {
    p = p.slice(1)
  }
  if (!/^[17][0-9]{8}$/.test(p)) {
    return ''
  }
  return '254' + p
}

/** Get (and cache) a Tuma JWT access token. */
export async function getTumaToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token
  }

  const res = await fetch(TUMA_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, api_key: API_KEY }),
  })

  if (!res.ok) {
    throw new Error(`Tuma auth failed: ${res.status}`)
  }

  const data = (await res.json()) as TumaAuthResponse
  const token = data?.data?.token

  if (!data.success || !token) {
    throw new Error(data.message || 'Tuma auth failed: no token returned')
  }

  // Tokens are long-lived (~20h); cache with a small safety margin.
  cachedToken = { token, expires: Date.now() + (19 * 60 * 60 * 1000) }
  return token
}

/**
 * Trigger an STK push to the customer phone for `amount` KES.
 * Returns the Tuma merchant/checkout request IDs (tracked for callbacks).
 */
export async function tumaStkPush(
  phone: string,
  amount: number,
  description: string
): Promise<{ merchant_request_id: string; checkout_request_id: string; customer_message?: string }> {
  const token = await getTumaToken()

  const normalized = normalizeKenyanPhone(phone)
  if (!normalized) {
    throw new Error('Enter a valid Kenyan phone number (e.g. 0726 498 682)')
  }

  const res = await fetch(TUMA_STK_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      phone: normalized,
      callback_url: TUMA_CALLBACK_URL,
      description: description || 'AseHanta booking fee',
    }),
  })

  if (!res.ok) {
    throw new Error(`Tuma STK push failed: ${res.status}`)
  }

  const data = (await res.json()) as TumaStkPushResponse

  if (!data.success) {
    throw new Error(data.message || 'Tuma STK push failed')
  }

  return {
    merchant_request_id: data.data?.merchant_request_id || '',
    checkout_request_id: data.data?.checkout_request_id || '',
    customer_message: data.data?.customer_message,
  }
}