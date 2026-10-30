import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'

const ALLOWED_STATUSES = ['pending', 'verifying', 'success', 'failed', 'refunded'] as const

/**
 * Admin-only transaction status override.
 *
 * This runs with the service-role client because `transactions` has no
 * client-side UPDATE policy: RLS silently ignores the write, which is why the
 * old in-page select appeared to "not budge". Every change is gated on a real
 * admin profile check here.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const status = String(body.status || '')
  if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
    return NextResponse.json({ error: 'Unsupported status' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: transaction, error } = await admin
    .from('transactions')
    .update({ status })
    .eq('id', id)
    .select('id, booking_id, user_id, amount, status, payment_method')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!transaction) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  // Treasury derives a booking's payment status from this transaction row, so
  // there is nothing to copy onto house_bookings. Deliberately do NOT mark the
  // booking paid from here: paid/refunded require an SMS-verified payout.

  // Let the hunter know their payment state changed.
  if (transaction.user_id) {
    await createNotification({
      userId: transaction.user_id,
      category: 'transaction',
      title: 'Payment status updated',
      body: `An administrator marked your payment as ${status}.`,
      link: '/my-bookings',
      data: { transaction_id: transaction.id, status },
    })
  }

  return NextResponse.json({ success: true, transaction })
}
