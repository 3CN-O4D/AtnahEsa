import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaymentSession, PaymentError } from '@/lib/payments'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to view this payment' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const isAdmin = profile?.role === 'admin'

    const { booking, transaction, listing } = await getPaymentSession(admin, {
      bookingId: id,
      userId: user.id,
      isAdmin,
    })

    return NextResponse.json({
      booking: {
        id: booking.id,
        listing_id: booking.listing_id,
        listing_title: booking.listing_title,
        listing_location: booking.listing_location,
        listing_price: booking.listing_price,
        phone: booking.phone,
        status: booking.status,
        release_status: booking.release_status,
        held_until: booking.held_until,
        mpesa_receipt: booking.mpesa_receipt,
        mpesa_message: booking.mpesa_message,
        confirmed_at: booking.confirmed_at,
        paid_at: booking.paid_at,
        refunded_at: booking.refunded_at,
        payment_method: booking.payment_method,
        created_at: booking.created_at,
      },
      transaction: transaction
        ? {
            id: transaction.id,
            status: transaction.status,
            amount: transaction.amount,
            mpesa_receipt: transaction.mpesa_receipt,
            result_desc: transaction.result_desc,
            transaction_request_id: transaction.originator_conversation_id,
            created_at: transaction.created_at,
          }
        : null,
      listing: listing
        ? {
            id: listing.id,
            title: listing.title,
            location: listing.location,
            images: listing.images,
            phone: listing.phone,
          }
        : null,
    })
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('payments/session error:', err)
    return NextResponse.json({ error: 'Could not load this payment' }, { status: 500 })
  }
}
