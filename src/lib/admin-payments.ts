import type { AuthUser } from '@supabase/supabase-js'
import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { applyAdminListingUpdate } from './admin-listing-update'

type AdminClient = ReturnType<typeof createAdminClient>

export type AdminGate =
  | { ok: true; user: AuthUser; admin: AdminClient; email: string | null }
  | { ok: false; status: number; error: string }

/** Admin API gate. Page middleware does not cover /api/admin/*. */
export async function requireAdmin(): Promise<AdminGate> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { ok: false, status: 403, error: 'Forbidden' }

  return {
    ok: true,
    user,
    admin: createAdminClient(),
    email: profile?.email ?? user.email ?? null,
  }
}

/** Form inputs arrive as strings; keep the database types clean. */
export function normalisePaymentBody(raw: Record<string, unknown>): Record<string, unknown> {
  const body = { ...raw }

  for (const key of ['amount', 'listing_price', 'listing_rent']) {
    if (body[key] === '' || body[key] === undefined) delete body[key]
    else body[key] = Number(body[key])
  }

  for (const key of ['listing_id', 'house_booking_id', 'transaction_id']) {
    if (body[key] === '') body[key] = null
  }

  for (const key of ['payer_phone', 'mpesa_receipt', 'mpesa_message', 'paid_at']) {
    if (body[key] === '') body[key] = null
  }

  if (typeof body.paid_at === 'string' && body.paid_at) {
    const parsed = new Date(body.paid_at)
    body.paid_at = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  return body
}

export const ADMIN_PAYMENT_COLUMNS = [
  'listing_id',
  'house_booking_id',
  'transaction_id',
  'payer_name',
  'payer_phone',
  'amount',
  'direction',
  'payment_type',
  'payment_method',
  'mpesa_receipt',
  'mpesa_message',
  'status',
  'paid_at',
  'notes',
] as const

export function paymentRowFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const key of ADMIN_PAYMENT_COLUMNS) {
    if (body[key] !== undefined) row[key] = body[key]
  }
  return row
}

const LISTING_FIELD_MAP: Record<string, string> = {
  listing_status: 'status',
  taken_by_name: 'taken_by_name',
  listing_title: 'title',
  listing_description: 'description',
  listing_location: 'location',
  listing_price: 'price',
  listing_rent: 'rent',
}

export function listingUpdatesFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const [source, target] of Object.entries(LISTING_FIELD_MAP)) {
    if (body[source] !== undefined) updates[target] = body[source]
  }
  return updates
}

/**
 * Field payments can also update the selected house. Reuses the admin listing
 * editor's helper so media moves, cache invalidation and sheet events are not
 * skipped. A failure here is reported as a warning: the money record is still
 * valid and must not be lost.
 */
export async function updateListingForPayment(
  admin: AdminClient,
  body: Record<string, unknown>,
  listingId: string | null | undefined
) {
  if (!listingId) return null
  const updates = listingUpdatesFromBody(body)
  if (!Object.keys(updates).length) return null
  return applyAdminListingUpdate(admin, listingId, updates)
}
