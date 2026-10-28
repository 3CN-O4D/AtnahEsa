import { z } from 'zod'
import crypto from 'crypto'

export const PayWaveConfig = {
  baseUrl: process.env.PAYWAVE_BASE_URL!,
  apiKey: process.env.PAYWAVE_API_KEY!,
  webhookSecret: process.env.PAYWAVE_WEBHOOK_SECRET!,
} as const

export const StkPushRequest = z.object({
  api_key: z.string(),
  email: z.string().email(),
  amount: z.string().regex(/^\d+$/),
  msisdn: z.string().regex(/^0[17]\d{8}$/),
  reference: z.string().min(1).max(100),
})

export const StkPushResponse = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    checkoutRequestID: z.string(),
    merchantRequestID: z.string(),
    responseCode: z.string(),
    responseDescription: z.string(),
    customerMessage: z.string(),
  }).optional(),
})

export const WebhookPayload = z.object({
  event: z.enum(['stkpush.success', 'stkpush.failed', 'stkpush.timeout']),
  data: z.object({
    checkoutRequestID: z.string(),
    merchantRequestID: z.string(),
    amount: z.string(),
    msisdn: z.string(),
    reference: z.string(),
    mpesaReceiptNumber: z.string().optional(),
    transactionDate: z.string().optional(),
    resultCode: z.string(),
    resultDesc: z.string(),
    signature: z.string(),
  }),
})

export type StkPushRequest = z.infer<typeof StkPushRequest>
export type WebhookPayload = z.infer<typeof WebhookPayload>

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', PayWaveConfig.webhookSecret)
    .update(payload)
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  )
}

export function normalizeMsisdn(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('254')) return '0' + cleaned.slice(3)
  if (cleaned.startsWith('0')) return cleaned
  if (cleaned.startsWith('7') || cleaned.startsWith('1')) return '0' + cleaned
  throw new Error('Invalid Kenyan phone number')
}

export async function initiateStkPush(params: {
  email: string
  amount: number
  msisdn: string
  reference: string
}) {
  const body = {
    api_key: PayWaveConfig.apiKey,
    email: params.email,
    amount: String(params.amount),
    msisdn: normalizeMsisdn(params.msisdn),
    reference: params.reference,
  }

  const response = await fetch(`${PayWaveConfig.baseUrl}/stkpush`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const raw = await response.text()
  const parsed = StkPushResponse.safeParse(JSON.parse(raw))
  
  if (!parsed.success) {
    throw new Error(`Invalid PayWave response: ${parsed.error.message}`)
  }

  if (!parsed.data.success) {
    throw new Error(parsed.data.message || 'STK push failed')
  }

  return parsed.data.data!
}

export async function queryTransaction(checkoutRequestID: string) {
  const response = await fetch(`${PayWaveConfig.baseUrl}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PayWaveConfig.apiKey}`,
    },
    body: JSON.stringify({ checkoutRequestID }),
  })

  return response.json()
}
