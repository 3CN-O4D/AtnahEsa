import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { moveMediaToTaken } from '@/lib/move-media'
import { createEscrowHold, releaseToLister, refundHunter } from '@/lib/escrow'
import { initiateStkPush, verifyWebhookSignature } from '@/lib/paywave'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'payments')
  if (!allowed) {
    const response = NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    return addSecurityHeaders(response)
  }

  try {
    const { action, ...params } = await req.json()
    const admin = createAdminClient()
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addSecurityHeaders(response)
    }

    switch (action) {
      case 'stkpush': {
        const { listing_id, amount, phone, email, reference } = params
        if (!listing_id || !amount || !phone || !email) {
          const response = NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        const { data: listing } = await admin
          .from('listings')
          .select('id, title, price, status, uploader_id')
          .eq('id', listing_id)
          .single()

        if (!listing || listing.status !== 'published') {
          const response = NextResponse.json({ error: 'Listing not available' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        const { data: booking, error: bookingError } = await admin
          .from('house_bookings')
          .insert({
            listing_id: listing.id,
            listing_title: listing.title,
            listing_price: amount,
            phone,
            email,
            user_id: user.id,
            payment_method: 'paywave',
            status: 'pending',
          })
          .select()
          .single()

        if (bookingError) throw bookingError

        const stkResult = await initiateStkPush({
          email,
          amount,
          msisdn: phone,
          reference: booking.id,
        })

        await createEscrowHold({
          bookingId: booking.id,
          hunterId: user.id,
          listerId: listing.uploader_id,
          amount: amount,
          listingTitle: listing.title,
        })

        return addSecurityHeaders(NextResponse.json({
          success: true,
          checkoutRequestID: stkResult.checkoutRequestID,
          merchantRequestID: stkResult.merchantRequestID,
          customerMessage: stkResult.customerMessage,
          bookingId: booking.id,
        }))
      }

      case 'confirm': {
        const { booking_id, escrow_id } = params
        const { data: booking } = await admin
          .from('house_bookings')
          .select('*')
          .eq('id', booking_id)
          .single()

        if (!booking || booking.user_id !== user.id) {
          const response = NextResponse.json({ error: 'Not your booking' }, { status: 403 })
          return addSecurityHeaders(response)
        }

        await releaseToLister({
          escrowId: params.escrow_id,
          action: 'hunter_confirm',
          actorId: user.id,
          reason: 'Hunter confirmed satisfaction',
        })

        await admin.from('house_bookings').update({ release_status: 'released' }).eq('id', booking_id)

        return addSecurityHeaders(NextResponse.json({ success: true, message: 'Funds released to lister' }))
      }

      case 'displeased': {
        const { booking_id, escrow_id, reason } = params
        const { data: booking } = await admin
          .from('house_bookings')
          .select('*')
          .eq('id', booking_id)
          .single()

        if (!booking || booking.user_id !== user.id) {
          const response = NextResponse.json({ error: 'Not your booking' }, { status: 403 })
          return addSecurityHeaders(response)
        }

        if (!params.reason?.trim()) {
          const response = NextResponse.json({ error: 'Reason required' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        await refundHunter({
          escrowId: params.escrow_id,
          reason: 'viewed_changed_mind',
          actorId: user.id,
          customReason: params.reason,
        })

        await admin.from('house_bookings').update({ release_status: 'refunded' }).eq('id', booking_id)

        return addSecurityHeaders(NextResponse.json({ success: true, message: '85% refund initiated' }))
      }

      case 'fake_no_show': {
        const { booking_id, escrow_id, reason } = params
        const { data: booking } = await admin
          .from('house_bookings')
          .select('*')
          .eq('id', booking_id)
          .single()

        if (!booking || booking.user_id !== user.id) {
          const response = NextResponse.json({ error: 'Not your booking' }, { status: 403 })
          return addSecurityHeaders(response)
        }

        await refundHunter({
          escrowId: params.escrow_id,
          reason: 'fake_listing',
          actorId: user.id,
          customReason: params.reason,
        })

        await admin.from('house_bookings').update({ release_status: 'refunded' }).eq('id', booking_id)

        return addSecurityHeaders(NextResponse.json({ success: true, message: '100% refund initiated' }))
      }

      default:
        const response = NextResponse.json({ error: 'Invalid action' }, { status: 400 })
        return addSecurityHeaders(response)
    }
  } catch (err) {
    const response = NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
    return addSecurityHeaders(response)
  }
}
