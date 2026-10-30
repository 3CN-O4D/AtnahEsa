import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReceiptPdf } from '@/lib/receipt'

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

    if (!isAdmin && booking.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const confirmed =
      booking.status === 'confirmed' || ['held', 'paid', 'released'].includes(booking.release_status)
    if (!confirmed) {
      return NextResponse.json({ error: 'This payment has not been confirmed yet' }, { status: 409 })
    }

    const { data: listing } = await admin
      .from('listings')
      .select('uploader_id, description, lister_phone')
      .eq('id', booking.listing_id)
      .maybeSingle()

    let listerName = 'AseHanta verified lister'
    let listerPhone = listing?.lister_phone || ''
    if (listing?.uploader_id) {
      const { data: lister } = await admin
        .from('profiles')
        .select('full_name, phone')
        .eq('id', listing.uploader_id)
        .maybeSingle()
      if (lister?.full_name) listerName = lister.full_name
      if (!listerPhone && lister?.phone) listerPhone = lister.phone
    }

    const pdf = await generateReceiptPdf({
      bookingId: booking.id,
      receiptNumber: booking.mpesa_receipt || '',
      listingTitle: booking.listing_title || 'House listing',
      listingLocation: booking.listing_location || booking.area || '',
      listingDescription: listing?.description || '',
      amount: Number(booking.listing_price) || 0,
      payerName: profile?.full_name || booking.name || '',
      payerEmail: booking.email || profile?.email || '',
      payerPhone: booking.phone || '',
      paidAt: booking.confirmed_at || booking.created_at,
      heldUntil: booking.held_until,
      paymentMethod: booking.payment_method || 'paywave',
      listerName,
      listerPhone,
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
