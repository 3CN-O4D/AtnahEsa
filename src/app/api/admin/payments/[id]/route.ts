import { NextResponse } from 'next/server'
import { addSecurityHeaders, validateRequest, VALIDATION_SCHEMAS, withRateLimit } from '@/lib/security'
import { normalisePaymentBody, paymentRowFromBody, requireAdmin, updateListingForPayment } from '@/lib/admin-payments'

export const runtime = 'nodejs'

function errorResponse(error: string, status: number) {
  return addSecurityHeaders(NextResponse.json({ error }, { status }))
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  const validation = validateRequest(VALIDATION_SCHEMAS.adminPaymentUpdate, normalisePaymentBody(raw))
  if (!validation.success) return addSecurityHeaders(validation.error)
  const body = validation.data as Record<string, unknown>

  if (!Object.keys(paymentRowFromBody(body)).length && !Object.keys(body).some((key) => key.startsWith('listing_'))) {
    return errorResponse('Nothing to update.', 400)
  }

  const { data: existing } = await gate.admin
    .from('admin_payments')
    .select('listing_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) return errorResponse('Payment not found.', 404)

  const method = typeof body.payment_method === 'string' ? body.payment_method.toLowerCase() : null
  const status = typeof body.status === 'string' ? body.status : null
  if (method?.includes('mpesa') || status === 'verified') {
    const { data: current } = await gate.admin
      .from('admin_payments')
      .select('payment_method,status,mpesa_receipt,mpesa_message')
      .eq('id', id)
      .single()
    const finalMethod = method || String(current?.payment_method || '').toLowerCase()
    const finalReceipt = body.mpesa_receipt !== undefined ? body.mpesa_receipt : current?.mpesa_receipt
    const finalMessage = body.mpesa_message !== undefined ? body.mpesa_message : current?.mpesa_message
    if (finalMethod.includes('mpesa') && (status === 'verified' || current?.status === 'verified') && !finalReceipt && !finalMessage) {
      return errorResponse('A verified M-Pesa payment needs a receipt or the confirmation SMS.', 400)
    }
  }

  const patch = {
    ...paymentRowFromBody(body),
    updated_by: gate.user.id,
  }
  const { data: payment, error } = await gate.admin
    .from('admin_payments')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error) return errorResponse(error.message, 500)

  const listingId = typeof body.listing_id === 'string' ? body.listing_id : existing.listing_id
  const listingResult = await updateListingForPayment(gate.admin, body, listingId)

  return addSecurityHeaders(
    NextResponse.json({
      payment,
      warning:
        listingResult && !listingResult.ok
          ? `Payment saved, but the house update failed: ${listingResult.error || 'unknown error'}`
          : undefined,
    })
  )
}

/** Soft delete with an explicit confirmation token from the admin UI. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rate = await withRateLimit(req, 'api')
  if (!rate.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rate.headers }))
  }

  const gate = await requireAdmin()
  if (!gate.ok) return errorResponse(gate.error, gate.status)

  let body: Record<string, unknown> = {}
  try {
    const parsed = await req.json().catch(() => ({}))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {
    /* an empty body is simply rejected below */
  }
  if (body.confirm !== 'DELETE') {
    return errorResponse('Type DELETE to confirm payment deletion.', 400)
  }

  const { error } = await gate.admin
    .from('admin_payments')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: gate.user.id,
      updated_by: gate.user.id,
    })
    .eq('id', id)
    .is('deleted_at', null)
  if (error) return errorResponse(error.message, 500)

  return addSecurityHeaders(NextResponse.json({ success: true }))
}
