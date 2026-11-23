import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReceiptPdf } from '@/lib/receipt'
import { resolveListerIdentity } from '@/lib/lister-identity'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: profile } = await admin.from('profiles').select('role, full_name, email').eq('id', user.id).maybeSingle()
    const isAdmin = profile?.role === 'admin'

    const { data: booking } = await admin.from('house_bookings').select('*').eq('id', id).maybeSingle()
    if (!booking) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })

    const { data: listing } = await admin
      .from('listings')
      .select('uploader_id, uploader_name, description, lister_phone, title')
      .eq('id', booking.listing_id)
      .maybeSingle()

    // The payer, the listing owner and admins may all keep proof of the
    // escrow payment. The listing owner sees the hunter as payer, not themselves.
    const isListingOwner = !!listing?.uploader_id && listing.uploader_id === user.id
    const forLister = !isAdmin && !!(booking.user_id && booking.user_id !== user.id) && isListingOwner
    if (!isAdmin && booking.user_id !== user.id && !isListingOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // A refunded booking was paid first, so the original M-Pesa receipt stays
    // downloadable as proof for the hunter.
    const confirmed =
      booking.status === 'confirmed' ||
      ['held', 'paid', 'released', 'refunded'].includes(booking.release_status)
    if (!confirmed) {
      return NextResponse.json({ error: 'This payment has not been confirmed yet' }, { status: 409 })
    }

    const lister = await resolveListerIdentity(admin, listing)

    // The official M-Pesa payer name is stored on the payment callback, not on
    // the booking. Keep it separate from the AseHanta account name so receipts
    // stay accurate when a friend or family member paid on the hunter's behalf.
    const { data: tx } = await admin
      .from('transactions')
      .select('raw_callback')
      .filter('raw_callback->>house_booking_id', 'eq', booking.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const raw = tx?.raw_callback && typeof tx.raw_callback === 'object'
      ? tx.raw_callback as Record<string, unknown>
      : null
    const mpesaName = [
      raw?.payer_name,
      raw?.official_payer_name,
      raw?.customer_name,
      raw?.mpesa_name,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()

    const pdf = await generateReceiptPdf({
      bookingId: booking.id,
      receiptNumber: booking.mpesa_receipt || '',
      listingTitle: booking.listing_title || listing?.title || 'House listing',
      listingLocation: booking.listing_location || booking.area || '',
      listingDescription: listing?.description || '',
      amount: Number(booking.listing_price) || 0,
      payerName: forLister || isAdmin ? String(booking.name || '') : profile?.full_name || String(booking.name || ''),
      mpesaName,
      payerEmail: forLister || isAdmin ? String(booking.email || '') : profile?.email || String(booking.email || ''),
      payerPhone: String(booking.phone || ''),
      paidAt: booking.confirmed_at || booking.created_at,
      heldUntil: booking.held_until,
      paymentMethod: booking.payment_method || 'paywave',
      listerName: lister.name,
      listerPhone: lister.phone || '',
    })

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="AseHanta-receipt-${booking.id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('payments/receipt error:', err)
    return NextResponse.json({ error: 'Could not generate the receipt' }, { status: 500 })
  }
}
