import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { notifyAdmins } from '@/lib/notify'
import {
  extractTransactionCode,
  extractAmountFromMessage,
  isValidMpesaMessage,
} from '@/lib/paywave'
import {
  confirmHouseBookingPayment,
  recordListerPayout,
  lookupPayWavePayment,
  checkSmsAgainstPayWave,
  PaymentError,
  type HouseBookingRow,
  type TransactionRow,
} from '@/lib/payments'
import { OWNER_SHARE, VIEW_WINDOW_HOURS } from '@/lib/constants'

const HOUSE_STATUSES = ['pending', 'contacted', 'confirmed', 'completed', 'cancelled'] as const
const RELEASE_STATUSES = [
  'pending',
  'held',
  'released',
  'paid',
  'refunded',
  'refund_requested',
  'rejected',
] as const

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { user }
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabase = await createClient()

  const { data: escrows } = await supabase
    .from('escrow_holds')
    .select('*, booking:bookings(*), listing:listings(title)')
    .order('created_at', { ascending: false })

  const { data: houseBookings } = await supabase
    .from('house_bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  // Attach the latest payment status so the dashboard can show "under review"
  // even though house_bookings has no review status column.
  const bookingIds = (houseBookings || []).map((b) => b.id)
  const { data: linkedTransactions } = bookingIds.length
    ? await supabase
        .from('transactions')
        .select('*')
        .filter('raw_callback->>house_booking_id', 'in', `(${bookingIds.join(',')})`)
        .order('created_at', { ascending: false })
    : { data: [] as TransactionRow[] }

  const latestTx = new Map<string, TransactionRow>()
  for (const tx of (linkedTransactions || []) as TransactionRow[]) {
    const linked = tx.raw_callback?.house_booking_id
    if (typeof linked === 'string' && !latestTx.has(linked)) latestTx.set(linked, tx)
  }

  const enrichedHouseBookings = (houseBookings || []).map((b) => {
    const tx = latestTx.get(b.id)
    return {
      ...b,
      payment_status: tx?.status || null,
      transaction_id: tx?.id || null,
      transaction_receipt: tx?.mpesa_receipt || b.mpesa_receipt || null,
    }
  })

  const totalHeld = (escrows || []).filter((e) => e.status === 'held').reduce((s, e) => s + (e.amount || 0), 0)
  const totalReleased = (escrows || []).filter((e) => e.status === 'released').reduce((s, e) => s + (e.amount || 0), 0)
  const totalRefunded = (escrows || []).filter((e) => e.status === 'refunded').reduce((s, e) => s + (e.amount || 0), 0)
  const platformRevenue =
    (escrows || [])
      .filter((e) => e.status === 'released')
      .reduce((s, e) => s + Math.round((e.amount || 0) * 0.5), 0) +
    enrichedHouseBookings
      .filter((h) => h.release_status === 'paid')
      .reduce((s, h) => s + Math.round((h.listing_price || 0) * (1 - OWNER_SHARE)), 0)

  const heldHouse = enrichedHouseBookings.filter((h) => h.release_status === 'held')
  const pendingPayoutsAmount = heldHouse.reduce((s, h) => s + (h.listing_price || 0), 0)
  const underReview = enrichedHouseBookings.filter(
    (h) => h.payment_status === 'verifying' && h.release_status === 'pending'
  )

  return NextResponse.json({
    stats: {
      total_escrows: (escrows?.length || 0) + enrichedHouseBookings.length,
      held: (escrows || []).filter((e) => e.status === 'held').length + heldHouse.length,
      released: (escrows || []).filter((e) => e.status === 'released').length,
      refunded:
        (escrows || []).filter((e) => e.status === 'refunded').length +
        enrichedHouseBookings.filter((h) => h.release_status === 'refunded').length,
      total_held_amount: totalHeld + pendingPayoutsAmount,
      total_released_amount: totalReleased,
      total_refunded_amount: totalRefunded,
      platform_revenue: platformRevenue,
      pending_payouts: heldHouse.length,
      pending_payouts_amount: pendingPayoutsAmount,
      under_review: underReview.length,
    },
    escrows: escrows || [],
    house_bookings: enrichedHouseBookings,
    transactions: recentTransactions || [],
  })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const user = auth.user!

  const body = await request.json().catch(() => ({}))
  const {
    action,
    escrow_id,
    house_booking_id,
    mpesa_message,
  } = body as Record<string, unknown>

  if (typeof action !== 'string' || !action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    if (action === 'house_verify' || action === 'house_release' || action === 'house_refund' || action === 'house_status') {
      if (typeof house_booking_id !== 'string' || !house_booking_id) {
        return NextResponse.json({ error: 'house_booking_id required' }, { status: 400 })
      }

      const { data: hbData } = await admin.from('house_bookings').select('*').eq('id', house_booking_id).maybeSingle()
      if (!hbData) return NextResponse.json({ error: 'House booking not found' }, { status: 404 })
      const hb = hbData as HouseBookingRow

      // ---- Verify a payment: SMS is the source of truth ----
      if (action === 'house_verify') {
        if (typeof mpesa_message !== 'string' || !mpesa_message.trim()) {
          return NextResponse.json(
            { error: 'Paste the M-Pesa confirmation SMS before verifying. It is required as proof of payment.' },
            { status: 400 }
          )
        }
        if (!isValidMpesaMessage(mpesa_message)) {
          return NextResponse.json(
            { error: 'That message is not an AseHanta M-Pesa confirmation. Nothing was changed.' },
            { status: 400 }
          )
        }

        const receipt = extractTransactionCode(mpesa_message)
        const amount = extractAmountFromMessage(mpesa_message)
        if (!receipt) {
          return NextResponse.json({ error: 'No M-Pesa transaction code found in that SMS' }, { status: 400 })
        }
        if (!amount) {
          return NextResponse.json({ error: 'No amount found in that SMS' }, { status: 400 })
        }

        const result = await (async () => {
          // Check PayWave's own record first: the receipt, amount and checkout
          // id must all line up. Only fall back to manual admin judgement when
          // PayWave cannot be reached or has no record at all.
          const lookup = await lookupPayWavePayment(admin, hb.id)

          if (lookup.available && lookup.status === 'Completed') {
            const check = checkSmsAgainstPayWave({ lookup, booking: hb, receipt, amount })
            if (!check.ok) {
              throw new PaymentError(check.code, check.message, 409)
            }
            return confirmHouseBookingPayment(admin, {
              bookingId: hb.id,
              amount: lookup.amount ?? amount,
              receiptNumber: lookup.receipt as string,
              paymentMethod: (body.payment_method as string) || hb.payment_method || 'paywave',
              phone: lookup.msisdn || hb.phone,
              source: 'admin',
              raw: {
                admin_id: user.id,
                admin_verified: true,
                paywave_verified: true,
                paywave_status: lookup.raw,
                mpesa_message,
              },
            })
          }

          if (lookup.available && (lookup.status === 'Failed' || lookup.status === 'Cancelled')) {
            throw new PaymentError(
              'PAYMENT_NOT_COMPLETED',
              `PayWave says this payment was ${lookup.status.toLowerCase()}. It cannot be verified as paid.`,
              409
            )
          }

          if (lookup.available && lookup.status === 'Pending') {
            throw new PaymentError(
              'PAYMENT_PENDING',
              'PayWave still shows this payment as pending. Wait for the M-Pesa confirmation, then verify again.',
              409
            )
          }

          // PayWave is unreachable or has no record. The admin's SMS proof is
          // still recorded in the audit trail with an explicit unverified flag.
          return confirmHouseBookingPayment(admin, {
            bookingId: hb.id,
            amount,
            receiptNumber: receipt,
            paymentMethod: (body.payment_method as string) || hb.payment_method || 'paywave',
            phone: hb.phone,
            source: 'admin',
            raw: {
              admin_id: user.id,
              admin_verified: true,
              paywave_verified: false,
              paywave_note: lookup.available
                ? `PayWave still shows this payment as ${lookup.status}; the admin verified it manually.`
                : lookup.reason,
              mpesa_message,
            },
          })
        })()

        // Store the full SMS for the audit trail.
        await admin.from('house_bookings').update({ mpesa_message }).eq('id', hb.id)

        return NextResponse.json({
          success: true,
          message: result.alreadyProcessed
            ? 'This payment was already confirmed.'
            : `Payment verified. KES ${amount.toLocaleString()} is now in escrow for ${VIEW_WINDOW_HOURS}h.`,
          extracted_receipt: receipt,
          extracted_amount: amount,
        })
      }

      // ---- Record a payout to the lister: SMS is mandatory ----
      if (action === 'house_release') {
        if (typeof mpesa_message !== 'string' || !mpesa_message.trim()) {
          return NextResponse.json(
            { error: 'Paste the M-Pesa payout SMS. It is required before marking the lister paid.' },
            { status: 400 }
          )
        }

        const percentage =
          typeof body.percentage === 'number' && body.percentage > 0 && body.percentage <= 100
            ? body.percentage / 100
            : undefined

        const result = await recordListerPayout(admin, {
          bookingId: hb.id,
          mpesaMessage: mpesa_message,
          adminId: user.id,
          percentage,
        })

        return NextResponse.json({
          success: true,
          message: `Lister paid. KES ${result.payoutAmount.toLocaleString()} recorded with receipt ${result.receipt}.`,
          payout_amount: result.payoutAmount,
          receipt: result.receipt,
        })
      }

      // ---- Refund the hunter: SMS is mandatory ----
      if (action === 'house_refund') {
        if (hb.release_status === 'refunded') {
          return NextResponse.json({ error: 'This booking is already refunded' }, { status: 400 })
        }
        if (typeof mpesa_message !== 'string' || !mpesa_message.trim()) {
          return NextResponse.json(
            { error: 'Paste the M-Pesa refund SMS. It is required as proof that the hunter was refunded.' },
            { status: 400 }
          )
        }

        const percentage =
          typeof body.percentage === 'number' && body.percentage > 0 && body.percentage <= 100
            ? body.percentage
            : 85
        const refundAmount = Math.round(Number(hb.listing_price) * (percentage / 100))

        const receipt = extractTransactionCode(mpesa_message)
        const amount = extractAmountFromMessage(mpesa_message)
        if (!receipt) {
          return NextResponse.json({ error: 'No M-Pesa transaction code found in that SMS' }, { status: 400 })
        }
        if (!amount) {
          return NextResponse.json({ error: 'No amount found in that SMS' }, { status: 400 })
        }
        if (amount !== refundAmount) {
          return NextResponse.json(
            {
              error: `The SMS shows KES ${amount.toLocaleString()} but this ${percentage}% refund should be exactly KES ${refundAmount.toLocaleString()}. Nothing was changed.`,
            },
            { status: 409 }
          )
        }

        const now = new Date().toISOString()
        const { error: refundError } = await admin
          .from('house_bookings')
          .update({
            release_status: 'refunded',
            refunded_at: now,
            mpesa_message,
          })
          .eq('id', hb.id)
        if (refundError) return NextResponse.json({ error: refundError.message }, { status: 500 })

        await admin.from('transactions').insert({
          booking_id: null,
          user_id: hb.user_id,
          listing_id: hb.listing_id,
          phone: hb.phone || '',
          amount: refundAmount,
          mpesa_receipt: receipt,
          mpesa_message: `Refund to hunter (${percentage}%): ${mpesa_message}`,
          checkout_request_id: '',
          originator_conversation_id: '',
          merchant_request_id: '',
          status: 'success',
          result_code: 0,
          result_desc: 'Refund completed',
          payment_method: 'refund',
          raw_callback: {
            house_booking_id: hb.id,
            refund: true,
            refund_percentage: percentage,
            refund_amount: refundAmount,
            admin_id: user.id,
            recorded_at: now,
          },
        })

        if (hb.user_id) {
          await createNotification({
            userId: hb.user_id,
            category: 'transaction',
            title: `${percentage}% refund processed`,
            body: `KES ${refundAmount.toLocaleString()} was refunded for ${hb.listing_title || 'your house'}. Receipt ${receipt}.`,
            link: '/my-bookings?tab=payments',
            data: { house_booking_id: hb.id, amount: refundAmount },
          })
        }

        await notifyAdmins('Hunter Refund Recorded', 'Refund Recorded', {
          Listing: hb.listing_title || hb.listing_id,
          Amount: `KES ${refundAmount.toLocaleString()} (${percentage}%)`,
          Receipt: receipt,
          Admin: user.email || user.id,
          Date: now,
        })

        return NextResponse.json({
          success: true,
          message: `${percentage}% refund of KES ${refundAmount.toLocaleString()} recorded.`,
          refund_amount: refundAmount,
          receipt,
        })
      }

      // ---- Explicit status override (keeps escrow + dashboards in sync) ----
      const nextStatus = typeof body.status === 'string' ? body.status : undefined
      const nextReleaseStatus = typeof body.release_status === 'string' ? body.release_status : undefined

      if (!nextStatus && !nextReleaseStatus) {
        return NextResponse.json({ error: 'Provide status or release_status' }, { status: 400 })
      }
      if (nextStatus && !HOUSE_STATUSES.includes(nextStatus as (typeof HOUSE_STATUSES)[number])) {
        return NextResponse.json({ error: `Invalid status '${nextStatus}'` }, { status: 400 })
      }
      if (
        nextReleaseStatus &&
        !RELEASE_STATUSES.includes(nextReleaseStatus as (typeof RELEASE_STATUSES)[number])
      ) {
        return NextResponse.json({ error: `Invalid release_status '${nextReleaseStatus}'` }, { status: 400 })
      }
      if (nextReleaseStatus === 'paid' || nextReleaseStatus === 'refunded') {
        return NextResponse.json(
          {
            error:
              nextReleaseStatus === 'paid'
                ? 'Use Record Payout with the M-Pesa payout SMS. A lister can only be marked paid with proof.'
                : 'Use Record Refund with the M-Pesa refund SMS. A refund can only be recorded with proof.',
          },
          { status: 400 }
        )
      }

      const now = new Date().toISOString()
      const update: Record<string, unknown> = {}

      if (nextStatus) update.status = nextStatus
      if (nextReleaseStatus) update.release_status = nextReleaseStatus

      if (nextReleaseStatus === 'held') {
        update.status = 'confirmed'
        update.confirmed_at = hb.confirmed_at || now
        update.held_until =
          hb.held_until || new Date(Date.now() + VIEW_WINDOW_HOURS * 3600 * 1000).toISOString()
        if (!hb.mpesa_receipt) {
          return NextResponse.json(
            { error: 'Cannot open escrow without a payment receipt. Use Verify with an SMS instead.' },
            { status: 400 }
          )
        }
      }
      if (nextReleaseStatus === 'paid') {
        update.paid_at = hb.paid_at || now
      }
      if (nextReleaseStatus === 'refunded') {
        update.refunded_at = hb.refunded_at || now
      }

      const { error: updateError } = await admin.from('house_bookings').update(update).eq('id', hb.id)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

      if (nextStatus === 'confirmed' && hb.status !== 'confirmed') {
        const { error: listingError } = await admin
          .from('listings')
          .update({ status: 'booked' })
          .eq('id', hb.listing_id)
        if (listingError) console.error('Failed to mark listing booked:', listingError)
      }

      if (hb.user_id) {
        await createNotification({
          userId: hb.user_id,
          category: 'transaction',
          title: 'Your payment status changed',
          body: `Booking ${hb.listing_title || hb.id.slice(0, 8)} is now ${nextStatus || hb.status} / ${nextReleaseStatus || hb.release_status}.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id: hb.id },
        })
      }

      return NextResponse.json({
        success: true,
        message: `Status updated to ${nextStatus || hb.status}${nextReleaseStatus ? ` / ${nextReleaseStatus}` : ''}.`,
      })
    }

    // ---- Legacy escrow_holds actions ----
    if (typeof escrow_id !== 'string' || !escrow_id) {
      return NextResponse.json(
        { error: `Invalid action '${action}'. Use house_verify, house_release, house_refund, house_status, release, refund, extend_hold, or reverse_tx.` },
        { status: 400 }
      )
    }

    const { data: escrow } = await admin.from('escrow_holds').select('*').eq('id', escrow_id).single()
    if (!escrow) return NextResponse.json({ error: 'Escrow not found' }, { status: 404 })

    if (action === 'release') {
      const { error: e1 } = await admin
        .from('escrow_holds')
        .update({ status: 'released', released_at: new Date().toISOString() })
        .eq('id', escrow_id)
      if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

      const { error: e2 } = await admin.from('bookings').update({ release_status: 'released' }).eq('id', escrow.booking_id)
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

      await admin.from('transactions').insert({
        booking_id: escrow.booking_id,
        user_id: escrow.user_id,
        phone: '',
        amount: escrow.amount,
        mpesa_receipt: '',
        mpesa_message: 'Admin released to lister',
        checkout_request_id: '',
        status: 'success',
      })

      return NextResponse.json({ success: true, message: 'Funds released to lister' })
    }

    if (action === 'refund') {
      const percentage = typeof body.percentage === 'number' ? body.percentage : 85
      const refundAmount = Math.round((escrow.amount || 0) * (percentage / 100))
      const { error: e1 } = await admin
        .from('escrow_holds')
        .update({ status: 'refunded', refunded_at: new Date().toISOString() })
        .eq('id', escrow_id)
      if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

      const { error: e2 } = await admin
        .from('bookings')
        .update({
          release_status: 'refunded',
          refund_percentage: percentage,
          refund_amount: refundAmount,
          refunded_at: new Date().toISOString(),
        })
        .eq('id', escrow.booking_id)
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

      await admin.from('transactions').insert({
        booking_id: escrow.booking_id,
        user_id: escrow.user_id,
        phone: '',
        amount: refundAmount,
        mpesa_receipt: '',
        mpesa_message: `Admin processed ${percentage}% refund`,
        checkout_request_id: '',
        status: 'success',
      })

      return NextResponse.json({ success: true, message: `${percentage}% refund (KES ${refundAmount.toLocaleString()}) processed` })
    }

    if (action === 'extend_hold') {
      const days = typeof body.days === 'number' ? body.days : 7
      const newUntil = new Date(Date.now() + days * 86400000).toISOString()
      const { error } = await admin.from('escrow_holds').update({ held_until: newUntil }).eq('id', escrow_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, message: `Hold extended by ${days} days` })
    }

    if (action === 'reverse_tx') {
      const txId = typeof body.transaction_id === 'string' ? body.transaction_id : ''
      if (!txId) return NextResponse.json({ error: 'transaction_id required' }, { status: 400 })
      const { data: tx } = await admin.from('transactions').select('*').eq('id', txId).single()
      if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      await admin.from('transactions').insert({
        booking_id: tx.booking_id,
        user_id: tx.user_id,
        phone: tx.phone,
        amount: -tx.amount,
        mpesa_receipt: '',
        mpesa_message: `Admin reversal of ${tx.mpesa_receipt || tx.id.slice(0, 8)}`,
        checkout_request_id: '',
        status: 'success',
      })
      return NextResponse.json({ success: true, message: `Reversal logged for KES ${tx.amount.toLocaleString()}` })
    }

    return NextResponse.json({ error: `Invalid action '${action}'` }, { status: 400 })
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message, code: err.code, ...(err.details || {}) }, { status: err.status })
    }
    console.error('admin/treasury error:', err)
    return NextResponse.json({ error: 'Treasury action failed' }, { status: 500 })
  }
}
