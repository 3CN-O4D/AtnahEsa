import { z } from 'zod'

export const PayWaveConfig = {
  baseUrl: process.env.PAYWAVE_BASE_URL || 'https://paywavexpress.co.ke',
  apiKey: process.env.PAYWAVE_API_KEY!,
  email: process.env.PAYWAVE_EMAIL!,
} as const

export const StkPushRequest = z.object({
  api_key: z.string(),
  email: z.string().email(),
  amount: z.string().regex(/^\d+$/),
  msisdn: z.string().min(9).max(15),
  reference: z.string().min(1).max(100),
  account_number: z.string().optional(),
})

export const StkPushResponse = z.object({
  ResponseCode: z.string(),
  success: z.string().optional(),
  message: z.string().optional(),
  transaction_request_id: z.string().optional(),
  MerchantRequestID: z.string().optional(),
  CheckoutRequestID: z.string().optional(),
  errorMessage: z.string().optional(),
  ResultCode: z.string().optional(),
  error: z.string().optional(),
})

export const TransactionStatusRequest = z.object({
  api_key: z.string(),
  email: z.string().email(),
  transaction_request_id: z.string(),
})

export const TransactionStatusResponse = z.object({
  ResultCode: z.string(),
  ResultDesc: z.string(),
  TransactionStatus: z.enum(['Pending', 'Completed', 'Failed', 'Cancelled']),
  TransactionReceipt: z.string().optional(),
  TransactionAmount: z.string().optional(),
  Msisdn: z.string().optional(),
  TransactionDate: z.string().optional(),
  TransactionReference: z.string().optional(),
  CheckoutRequestID: z.string().optional(),
  MerchantRequestID: z.string().optional(),
})

export const WebhookPayload = z.object({
  ResponseCode: z.number(),
  ResponseDescription: z.string(),
  MerchantRequestID: z.string(),
  CheckoutRequestID: z.string(),
  TransactionID: z.string().optional(),
  TransactionAmount: z.number().optional(),
  TransactionReceipt: z.string().optional(),
  TransactionDate: z.string().optional(),
  TransactionReference: z.string().optional(),
  Msisdn: z.string(),
})

export type StkPushRequest = z.infer<typeof StkPushRequest>
export type TransactionStatusResponse = z.infer<typeof TransactionStatusResponse>
export type WebhookPayload = z.infer<typeof WebhookPayload>

export function normalizeMsisdn(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('254')) {
    if (cleaned.length !== 12) throw new Error('Invalid Kenyan phone number')
    return cleaned
  }
  if (cleaned.startsWith('0')) {
    if (cleaned.length !== 10) throw new Error('Invalid Kenyan phone number')
    return '254' + cleaned.slice(1)
  }
  if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    if (cleaned.length !== 9) throw new Error('Invalid Kenyan phone number')
    return '254' + cleaned
  }
  throw new Error('Invalid Kenyan phone number')
}

export function extractTransactionCode(message: string): string | null {
  const patterns = [
    /([A-Z][A-Z0-9]{3,})\s+Confirmed/i,
    /([A-Z0-9]{10,})/,
  ]
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function isValidMpesaMessage(message: string): boolean {
  const upper = message.toUpperCase()
  return /ASEHANTA\s+INVESTMENTS/i.test(upper) || /Tuma|I&M|I AND M|tinua/i.test(upper)
}

export function extractAmountFromMessage(message: string): number | null {
  const match = message.match(/(?:KSh|KES)\s*([\d,]+)/i) || message.match(/([\d,]+)\s*(?:KSh|KES)/i)
  if (!match) return null
  return parseInt(match[1].replace(/,/g, ''))
}

export async function initiateStkPush(params: {
  email: string
  amount: number
  msisdn: string
  reference: string
}) {
  const body: Record<string, unknown> = {
    api_key: PayWaveConfig.apiKey,
    email: PayWaveConfig.email,
    amount: String(params.amount),
    msisdn: normalizeMsisdn(params.msisdn),
    reference: params.reference,
  }

  const response = await fetch(`${PayWaveConfig.baseUrl}/v1/stkpush`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const raw = await response.text()
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid PayWave response: ${raw}`)
  }

  const validated = StkPushResponse.safeParse(parsed)
  if (!validated.success) {
    throw new Error(`Invalid PayWave response: ${validated.error.message}`)
  }

  const data = validated.data

  if (data.ResultCode === '102' || data.error || data.errorMessage) {
    throw new Error(data.errorMessage || data.error || 'STK push failed')
  }

  if (data.ResponseCode !== '0' && data.ResponseCode !== '200' && data.success !== '200') {
    throw new Error(data.message || `STK push failed (code: ${data.ResponseCode})`)
  }

  return {
    transactionRequestID: data.transaction_request_id,
    merchantRequestID: data.MerchantRequestID,
    checkoutRequestID: data.CheckoutRequestID,
    customerMessage: data.message || 'Please enter your MPESA PIN to complete the transaction',
    responseCode: data.ResponseCode,
  }
}

export async function verifyTransaction(transactionRequestID: string) {
  const body = {
    api_key: PayWaveConfig.apiKey,
    email: PayWaveConfig.email,
    transaction_request_id: transactionRequestID,
  }

  const response = await fetch(`${PayWaveConfig.baseUrl}/v1/tstatus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const raw = await response.text()
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid PayWave status response: ${raw}`)
  }

  const validated = TransactionStatusResponse.safeParse(parsed)
  if (!validated.success) {
    throw new Error(`Invalid PayWave status response: ${validated.error.message}`)
  }

  return validated.data
}

export function parseWebhookPayload(rawBody: string): WebhookPayload | null {
  try {
    const parsed = JSON.parse(rawBody)
    const validated = WebhookPayload.safeParse(parsed)
    if (!validated.success) return null
    return validated.data
  } catch {
    return null
  }
}
