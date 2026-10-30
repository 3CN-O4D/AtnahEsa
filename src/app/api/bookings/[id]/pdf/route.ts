import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import PDFDocument from 'pdfkit'
import { formatPrice } from '@/lib/utils'

function buildBookingPdf({
  booking,
  listing,
  profile,
  source,
}: {
  booking: any
  listing: any
  profile: any
  source: 'bookings' | 'house_bookings'
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'AseHanta Booking Receipt', Author: 'AseHanta' } })

  const paid = booking.release_status === 'paid' || booking.release_status === 'held'
  const amount = booking.amount ?? booking.listing_price ?? 0
  const method =
    source === 'house_bookings' && booking.payment_method ? booking.payment_method : 'Tuma (M-Pesa STK Push)'
  const receipt = booking.mpesa_receipt || '-'
  const bookedOn = booking.created_at ? new Date(booking.created_at).toLocaleDateString() : '-'
  const heldUntil = booking.held_until ? new Date(booking.held_until).toLocaleString() : '-'

  // ---- Header ----
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#2563EB').text('AseHanta', 56, 46)
  doc.font('Helvetica').fontSize(10).fillColor('#64748B').text('Find your home in Kenya · https://www.asehanta.com', 56, 72)
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(17).text('Booking Confirmation', 56, 96)
  doc.font('Helvetica').fontSize(9).fillColor('#64748B').text(`Receipt #${booking.id.slice(0, 8).toUpperCase()}  ·  ${bookedOn}`, 56, 114)

  const headerBottom = 130

  // ---- Booking details grid ----
  const rows: Array<[string, string]> = [
    ['Property', listing.title || '-'],
    ['Location', listing.location || '-'],
    ['House type', listing.house_type || '-'],
    ['Rent / month', formatPrice(listing.rent || 0)],
    ['Booking (hunting) fee', formatPrice(amount)],
    ['Booked by', profile?.full_name || '-'],
    ['Your phone', profile?.phone || booking.phone || '-'],
    ['Payment method', method],
    ['M-Pesa receipt', receipt],
    ['Payment status', (booking.release_status || booking.status || 'pending').charAt(0).toUpperCase() + (booking.release_status || booking.status || 'pending').slice(1)],
    ['Escrow held until', heldUntil],
    ['Protection', '24-hour escrow — 85% refund if displeased'],
  ]

  let y = headerBottom
  for (const [label, value] of rows) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text(label, 56, y, { width: 150 })
    doc.font('Helvetica').fontSize(9).fillColor('#1E293B').text(value, 210, y, { width: 330 })
    y += 17
  }

  // ---- Lister contact (only once the payment is confirmed) ----
  const paymentConfirmed =
    paid ||
    booking.status === 'confirmed' ||
    booking.release_status === 'released' ||
    booking.release_status === 'refund_requested'
  const listerName = listing.uploader_name || 'AseHanta lister'
  const listerPhone = paymentConfirmed ? listing.lister_phone || '-' : null
  y += 10
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1E293B').text('Listed by', 56, y)
  doc.font('Helvetica').fontSize(9).fillColor('#475569').text(listerName, 56, y + 15)
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(listerPhone ? '#475569' : '#B45309')
    .text(
      listerPhone ? `Phone: ${listerPhone}` : 'Phone: unlocks in My Bookings once your payment is confirmed',
      56,
      y + 30
    )

  // ---- Escrow / refund notice ----
  y += 52
  doc.roundedRect(56, y, 488, 62, 8).fill('#EFF6FF').stroke('#BFDBFE').lineWidth(1)
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1E40AF').text('How escrow works', 72, y + 12)
  doc.font('Helvetica').fontSize(8.5).fillColor('#1E3A8A')
    .text('Your payment is held securely by AseHanta for 24 hours. Visit the house within that time. ' +
      'If you&rsquo;re satisfied, confirm the viewing in My Bookings and the lister is paid. ' +
      'If you&rsquo;re displeased, you can request an 85% refund. Otherwise the escrow auto-pays the lister.',
      72, y + 26, { width: 456, align: 'left' })

  // ---- Footer ----
  const pageHeight = doc.page.height
  doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8')
    .text('AseHanta · Kenya · https://www.asehanta.com · This receipt confirms your booking payment only.', 56, pageHeight - 50, {
      width: 488,
      align: 'center',
    })

  doc.end()

  const chunks: Buffer[] = []
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Prefer the Tuma escrow booking; fall back to the Till/manual house booking.
    let booking: any = null
    let source: 'bookings' | 'house_bookings' = 'bookings'

    const { data: b1 } = await supabase
      .from('bookings')
      .select('*')
      .eq('listing_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (b1) {
      booking = b1
    } else {
      source = 'house_bookings'
      const { data: b2 } = await supabase
        .from('house_bookings')
        .select('*')
        .eq('listing_id', id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      booking = b2
    }

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { data: listing } = await supabase.from('listings').select('*').eq('id', id).single()
    const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).single()

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const pdf = await buildBookingPdf({ booking, listing, profile, source })

    const filename = `asehanta-booking-${booking.id.slice(0, 8)}.pdf`
    return new NextResponse(new Blob([new Uint8Array(pdf)]), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.length),
      },
    })
  } catch (err) {
    console.error('PDF error:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
