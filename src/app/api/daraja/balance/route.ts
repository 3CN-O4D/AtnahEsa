import { NextResponse } from 'next/server'
import { accountBalance } from '@/lib/daraja'

export async function GET() {
  const hasKeys = process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_SHORTCODE
  if (!hasKeys) {
    return NextResponse.json({
      configured: false,
      message: 'Daraja keys not configured. Set DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_PASSKEY, DARAJA_SHORTCODE in .env',
    })
  }

  try {
    const result = await accountBalance()
    return NextResponse.json({ configured: true, result })
  } catch (err) {
    return NextResponse.json({ configured: true, error: 'Failed to query balance', detail: String(err) }, { status: 500 })
  }
}
