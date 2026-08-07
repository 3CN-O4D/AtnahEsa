import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'
import { TILL_NUMBER } from '@/lib/constants'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    const { allowed, retryAfter } = await checkRateLimit(`house-book:${getClientIp(req)}`, 5, 300)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const { listing_id, listing_title, listing_location, listing_price, name, phone, area, id_number, mpesa_message, transaction_code } = await req.json()

    if (!listing_id || !phone || !mpesa_message) {
      return NextResponse.json({ error: 'Phone number and M-Pesa message are required' }, { status: 400 })
    }

    if (!transaction_code || !/^[A-Z][A-Z0-9]{3,}$/.test(transaction_code)) {
      return NextResponse.json({ error: 'A valid transaction code is required (e.g. ABCDE12345)' }, { status: 400 })
    }

    // Accept Till (ASEHANTA INVESTMENTS) and Tuma/I&M M-Pesa confirmation messages.
    const isTillMessage = /ASEHANTA\s+INVESTMENTS/i.test(mpesa_message)
    const isTumaMessage = /Tuma|I&M|I AND M|tinua/i.test(mpesa_message)
    if (!isTillMessage && !isTumaMessage) {
      return NextResponse.json({ error: 'We could not recognise this as a valid payment confirmation. If you paid via M-Pesa / Till or Tuma, paste the exact message you received.' }, { status: 400 })
    }

    const amountMatch = mpesa_message.match(/Ksh([\d,]+\.\d{2})/)
    const amountPaid = amountMatch ? amountMatch[1] : null

    const supabase = await createClient()
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
      return NextResponse.json({ error: error.message }, { status: 500 })
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

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
