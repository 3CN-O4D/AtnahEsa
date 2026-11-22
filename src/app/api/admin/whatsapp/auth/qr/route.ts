import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Stream the worker's live pairing QR without exposing the pair token. */

const WORKER_URL = (
  process.env.WHATSAPP_WORKER_URL || 'https://atnahesa.onrender.com'
).replace(/\/$/, '')
const SECRET = process.env.WHATSAPP_BRIDGE_SECRET || ''

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  if (!SECRET) return NextResponse.json({ error: 'Bridge secret not configured.' }, { status: 503 })

  try {
    const res = await fetch(`${WORKER_URL}/qr.png`, {
      headers: {
        'x-pair-token': SECRET,
        'x-bridge-secret': SECRET,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'No active pairing QR. Request a new code first.' }, { status: 409 })
    }
    return new NextResponse(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[admin/whatsapp/auth/qr] worker unreachable:', error)
    return NextResponse.json({ error: 'WhatsApp worker is unreachable.' }, { status: 502 })
  }
}
