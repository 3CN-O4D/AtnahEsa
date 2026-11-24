import { NextResponse } from 'next/server'
import { addSecurityHeaders, validateRequest, VALIDATION_SCHEMAS, withRateLimit } from '@/lib/security'
import { normalisePaymentBody, paymentRowFromBody, requireAdmin, updateListingForPayment } from '@/lib/admin-payments'

export const runtime = 'nodejs'

function errorResponse(error: string, status: number) {
  return addSecurityHeaders(NextResponse.json({ error }, { status }))
}

/** All treasury payments, including the house attached to each one. */
export async function GET(req: Request) {
  const rate = await withRateLimit(req, 'api')
  if (!rate.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rate.headers }))
  }

  const gate = await requireAdmin()
  if (!gate.ok) return errorResponse(gate.error, gate.status)

  const { data, error } = await gate.admin
    .from('admin_payments')
    .select('*,listings(id,title,location,status),house_bookings(id,listing_title),transactions(id,mpesa_receipt)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) return errorResponse(error.message, 500)

  const payments = (data ?? []).map((row) => {
    const nested = row.listings
    const listing = Array.isArray(nested) ? nested[0] ?? null : nested ?? null
    return { ...row, listing }
  })

  const totals = payments.reduce(
    (acc, row) => {
      if (row.deleted_at) return acc
      acc.count += 1
      const amount = Number(row.amount) || 0
      if (row.direction === 'out') acc.out += amount
      else acc.in += amount
      return acc
    },
    { count: 0, in: 0, out: 0 }
  )

  return addSecurityHeaders(NextResponse.json({ payments, totals }, { headers: { 'Cache-Control': 'no-store' } }))
}

/** Create a payment and, when requested, update the selected house. */
export async function POST(req: Request) {
  const rate = await withRateLimit(req, 'api')
  if (!rate.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rate.headers }))
  }

  const gate = await requireAdmin()
  if (!gate.ok) return errorResponse(gate.error, gate.status)

  let raw: Record<string, unknown>
  try {
    const parsed = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return errorResponse('Invalid request.', 400)
    raw = parsed as Record<string, unknown>
  } catch {
    return errorResponse('Invalid request.', 400)
  }

  const validation = validateRequest(VALIDATION_SCHEMAS.adminPaymentCreate, normalisePaymentBody(raw))
  if (!validation.success) return addSecurityHeaders(validation.error)
  const body = validation.data as Record<string, unknown>

  const method = String(body.payment_method || 'manual').toLowerCase()
  const status = String(body.status || 'recorded')
  if (method.includes('mpesa') && status === 'verified' && !body.mpesa_receipt && !body.mpesa_message) {
    return errorResponse('A verified M-Pesa payment needs a receipt or the confirmation SMS.', 400)
  }

  const row = {
    ...paymentRowFromBody(body),
    created_by: gate.user.id,
    updated_by: gate.user.id,
  }

  const { data: payment, error } = await gate.admin
    .from('admin_payments')
    .insert(row)
    .select('*')
    .single()
  if (error) return errorResponse(error.message, 500)

  const listingId = typeof body.listing_id === 'string' ? body.listing_id : null
  const listingResult = await updateListingForPayment(gate.admin, body, listingId)
  let listing = null
  if (listingId) {
    const { data } = await gate.admin
      .from('listings')
      .select('id,title,location,status')
      .eq('id', listingId)
      .single()
    listing = data ?? null
  }

  return addSecurityHeaders(
    NextResponse.json({
      payment,
      listing,
      warning:
        listingResult && !listingResult.ok
          ? `Payment saved, but the house update failed: ${listingResult.error || 'unknown error'}`
          : undefined,
    })
  )
}
