import { NextResponse } from 'next/server'
import { POST as releaseBooking } from '@/app/api/house-bookings/release/route'

/**
 * Legacy URL kept so old clients keep working. It delegates to the canonical
 * release handler so money can never move without admin SMS proof.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const nextReq = new Request(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, booking_id: id }),
  })

  try {
    return await releaseBooking(nextReq)
  } catch (err) {
    console.error('Legacy house booking release failed:', err)
    return NextResponse.json({ error: 'Could not process this action' }, { status: 500 })
  }
}
