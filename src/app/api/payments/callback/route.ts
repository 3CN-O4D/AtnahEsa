import { NextResponse } from 'next/server'
import { POST as paywaveWebhook } from '@/app/api/payments/paywave/webhook/route'

/**
 * Backwards-compatible callback URL. PayWave (and any old Daraja callback
 * still pointing here) is handled by the single shared webhook engine so a
 * payment can never be confirmed through a weaker code path.
 */
export async function POST(req: Request) {
  return paywaveWebhook(req)
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
