import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins, notifyUser } from '@/lib/notify'
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, TILL_NUMBER } from '@/lib/constants'
import { withRateLimit, addSecurityHeaders, validateRequest, VALIDATION_SCHEMAS } from '@/lib/security'

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'contact')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers })
  }

  try {
    const body = await req.json()
    const validation = validateRequest(VALIDATION_SCHEMAS.contactSubmit, body)
    if (!validation.success) {
      const resp = validation.error
      return addSecurityHeaders(resp)
    }

    const { listing_id, listing_title, listing_location, listing_price, name, phone, area, id_number, mpesa_message, transaction_code } = body

    // Additional validation for payment confirmation
    if (!transaction_code || !/^[A-Z][A-Z0-9]{3,}$/.test(transaction_code)) {
      const resp = NextResponse.json({ error: 'A valid transaction code is required (e.g. ABCDE12345)' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    // Accept Till (ASEHANTA INVESTMENTS) and Tuma/I&M M-Pesa confirmation messages.
    const isTillMessage = /ASEHANTA\s+INVESTMENTS/i.test(mpesa_message)
    const isTumaMessage = /Tuma|I&M|I AND M|tinua/i.test(mpesa_message)
    if (!isTillMessage && !isTumaMessage) {
      const resp = NextResponse.json({ error: 'We could not recognise this as a valid payment confirmation. If you paid via M-Pesa / Till or Tuma, paste the exact message you received.' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    const amountMatch = mpesa_message.match(/Ksh([\d,]+\.\d{2})/)
    const amountPaid = amountMatch ? amountMatch[1] : null

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const buyerEmail = (typeof body.email === 'string' && body.email.trim()) || user?.email || ''

    const { error } = await supabase.from('house_bookings').insert({
      listing_id,
      listing_title: listing_title || '',
      listing_location: listing_location || '',
      listing_price: listing_price || 0,
      name: name || 'Registered user',
      phone,
      area: area || '',
      id_number: id_number || '',
      mpesa_message,
      payment_method: isTumaMessage ? 'tuma' : 'daraja_till',
    })

    if (error) {
      const resp = NextResponse.json({ error: error.message }, { status: 500 })
      return addSecurityHeaders(resp)
    }

    await notifyAdmins(
      'Till Payment Received',
      'Till Payment House Booking',
      {
        Name: name || 'Registered user',
        Phone: phone,
        Area: area || 'Not provided',
        'ID Number': id_number || 'Not provided',
        'Transaction Code': transaction_code,
        'Amount Paid': amountPaid ? `Ksh ${amountPaid}` : 'N/A',
        House: listing_title || 'N/A',
        Location: listing_location || 'N/A',
        Price: listing_price ? `KES ${listing_price.toLocaleString()}` : 'N/A',
        'Till Number': TILL_NUMBER,
        'Full M-Pesa Message': mpesa_message,
        'Action Required': 'Verify the payment above, then mark the house as taken.',
      }
    )

    // The hunter also needs to hear that the booking landed. Best-effort: an
    // SMTP problem must never lose a submitted booking.
    if (buyerEmail) {
      notifyUser(buyerEmail, 'Booking received — we are verifying your payment', 'Booking Received', {
        House: listing_title || 'House listing',
        Location: listing_location || '—',
        Amount: listing_price ? `KES ${listing_price.toLocaleString()}` : amountPaid ? `Ksh ${amountPaid}` : '—',
        'M-Pesa code': transaction_code,
        Status: 'Payment submitted — AseHanta is verifying it now',
        'What Happens Next':
          'We check the M-Pesa message against our Till, then email your receipt and unlock the lister contact in My Bookings.',
        'Need Help': `${CONTACT_PHONE_DISPLAY} · ${CONTACT_EMAIL}`,
      }).catch((err) => console.error('Booking confirmation email failed:', err))
    }

    const resp = NextResponse.json({ success: true })
    return addSecurityHeaders(resp)
  } catch {
    const resp = NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    return addSecurityHeaders(resp)
  }
}
