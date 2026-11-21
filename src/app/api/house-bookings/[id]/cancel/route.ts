import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { notifyAdmins, notifyUser } from '@/lib/notify'
import { notifyPhoneWhatsApp } from '@/lib/whatsapp/outbox'
import { invalidateCached } from '@/lib/server-cache'
import { deriveBookingState } from '@/lib/booking-workflow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function samePhone(a: unknown, b: unknown): boolean {
  const left = digits(a)
  const right = digits(b)
  if (!left || !right) return false
  return left.slice(-9) === right.slice(-9)
}

/**
 * Payer-initiated cancellation for a booking that has not been confirmed.
 *
 * Once money is in escrow a hunter cannot silently cancel: they must file a
 * report so an admin can contact both sides before a refund or payout. If a
 * late payment callback arrives after cancellation, the central confirmation
 * engine converts it into a full-refund review instead of reserving the house.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: bookingId } = await params
    const body = await req.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to manage your booking' }, { status: 401 })

    const admin = createAdminClient()
    const { data: bookingData, error: bookingError } = await admin
      .from('house_bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle()
    if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 })
    if (!bookingData) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const booking = bookingData as Record<string, unknown>
    const { data: profile } = await admin
      .from('profiles')
      .select('phone, full_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const ownedById = !!booking.user_id && booking.user_id === user.id
    const ownedByPhone = !booking.user_id && samePhone(booking.phone, profile?.phone)
    if (!ownedById && !ownedByPhone) {
      return NextResponse.json({ error: 'This is not your booking' }, { status: 403 })
    }

    const { data: transactions } = await admin
      .from('transactions')
      .select('id, status, raw_callback, mpesa_message')
      .filter('raw_callback->>house_booking_id', 'eq', bookingId)
      .order('created_at', { ascending: false })
      .limit(5)
    const latest = (transactions ?? [])[0] as Record<string, unknown> | undefined

    const state = deriveBookingState(booking as never, latest as never)
    if (state.phase === 'cancelled') {
      return NextResponse.json({ success: true, already_cancelled: true, message: 'This booking is already cancelled.' })
    }

    if (!state.payerActions.includes('cancel')) {
      const guidance: Record<string, string> = {
        payment_received_unapplied:
          'M-Pesa already shows a successful payment. Do not pay again — an admin is attaching it to this booking.',
        escrow_held:
          'Your payment is already in escrow. Open the booking and report a problem to request a refund.',
        awaiting_payout: 'You already confirmed this viewing. Contact support if something changed.',
        issue_open: 'A refund report is already open. An admin is reviewing it.',
        refund_approved: 'Your refund was approved. An admin will send the M-Pesa refund shortly.',
        refunded: 'This booking has already been refunded.',
        paid: 'This booking is complete and cannot be cancelled.',
      }
      return NextResponse.json(
        {
          error: guidance[state.phase] || 'This booking can no longer be cancelled.',
          phase: state.phase,
          code: 'CANCEL_NOT_ALLOWED',
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const { error: updateError } = await admin
      .from('house_bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId)
      .neq('status', 'cancelled')
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Keep an audit trail in the transaction table without inventing a new
    // status value the live check constraint would reject.
    if (latest?.id) {
      await admin
        .from('transactions')
        .update({
          raw_callback: {
            ...((latest.raw_callback as Record<string, unknown>) ?? {}),
            cancelled_by_payer_at: now,
            cancellation_reason: reason || 'No reason given',
          },
        })
        .eq('id', String(latest.id))
    } else {
      await admin.from('transactions').insert({
        phone: String(booking.phone ?? profile?.phone ?? ''),
        user_id: user.id,
        listing_id: booking.listing_id,
        amount: 0,
        status: 'failed',
        result_code: 1,
        result_desc: 'Booking cancelled by payer before payment confirmation',
        payment_method: String(booking.payment_method ?? 'none'),
        mpesa_message: `Booking cancelled by payer${reason ? `: ${reason}` : ''}`,
        raw_callback: {
          source: 'payer_cancel',
          house_booking_id: bookingId,
          cancelled_at: now,
          cancellation_reason: reason || 'No reason given',
        },
      })
    }

    // Release the house only when no other active booking still holds it.
    const { data: active } = await admin
      .from('house_bookings')
      .select('id')
      .eq('listing_id', String(booking.listing_id ?? ''))
      .neq('id', bookingId)
      .in('status', ['pending', 'contacted', 'confirmed', 'completed'])
      .limit(1)
    if (!active?.length && booking.listing_id) {
      await admin
        .from('listings')
        .update({ status: 'published', taken_at: null, taken_by_name: '' })
        .eq('id', String(booking.listing_id))
      invalidateCached('listings|')
    }

    const title = String(booking.listing_title || 'house viewing')
    const amount = Number(booking.listing_price) || 0

    await Promise.allSettled([
      createNotification({
        userId: user.id,
        category: 'transaction',
        title: 'Booking cancelled',
        body: `Your booking for ${title} was cancelled. No viewing fee was taken.`,
        link: '/my-bookings?tab=payments',
        data: { house_booking_id: bookingId },
      }),
      notifyUser(
        String(booking.email ?? profile?.email ?? user.email ?? ''),
        'Booking cancelled',
        'Your booking was cancelled',
        {
          House: title,
          Amount: amount ? `KES ${amount.toLocaleString()} was not charged` : 'No payment taken',
          Reason: reason || 'No reason given',
          'Book Again': 'You can open the listing and request another viewing at any time.',
        }
      ),
      notifyPhoneWhatsApp(
        String(booking.phone ?? profile?.phone ?? ''),
        'Booking Cancelled',
        'Your viewing request was cancelled ✅',
        {
          House: title,
          Fee: 'No viewing fee was charged.',
          Reason: reason || 'No reason given',
          'Book Again': 'You can request another viewing on AseHanta.',
        }
      ),
      notifyAdmins('House Booking Cancelled', 'Booking Cancelled', {
        House: title,
        Hunter: `${profile?.full_name || booking.name || user.email || 'Hunter'} (${booking.phone || 'N/A'})`,
        Reason: reason || 'No reason given',
        'Payment': latest?.status ? String(latest.status) : 'none',
        'Booking ID': bookingId,
      }),
    ])

    return NextResponse.json({
      success: true,
      message: 'Booking cancelled. No viewing fee was charged.',
      phase: 'cancelled',
    })
  } catch (error) {
    console.error('[house-bookings/cancel] failed:', error)
    return NextResponse.json({ error: 'Could not cancel this booking' }, { status: 500 })
  }
}
