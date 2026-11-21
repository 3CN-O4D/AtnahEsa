import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'
import { notifyPhoneWhatsApp } from '@/lib/whatsapp/outbox'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { WIFI_INSTALLATION_FEE } from '@/lib/constants'
import { normalizePhone } from '@/lib/whatsapp'

const PACKAGE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  try {
    const { allowed, retryAfter } = await checkRateLimit(`wifi-book:${getClientIp(req)}`, 10, 300)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Try again shortly or WhatsApp us on 0748275079.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    const {
      package_id,
      package_name,
      package_speed,
      package_price,
      package_provider,
      package_original_price,
      package_description,
      package_features,
      name,
      phone,
      area,
      id_number,
    } = await req.json()

    if (!name || !phone || !area || !id_number) {
      return NextResponse.json({ error: 'Name, phone, area, and ID number are required' }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Enter a valid phone number so we can call you' }, { status: 400 })
    }

    if (package_id && !PACKAGE_ID_RE.test(String(package_id))) {
      return NextResponse.json(
        { error: 'That WiFi package is no longer available. Refresh the page and choose again.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    let monthlyPrice = Math.round(Number(package_price) || 0)

    // Resolve the price from the database so a stale or tampered client value
    // cannot change the total, and reseeded package UUIDs fail with a clear
    // message instead of a foreign-key error.
    if (package_id) {
      const { data: pkg, error: pkgError } = await admin
        .from('wifi_packages')
        .select('id, price, name')
        .eq('id', package_id)
        .maybeSingle()

      if (pkgError) {
        console.error('WiFi package lookup failed:', pkgError)
      } else if (!pkg) {
        return NextResponse.json(
          { error: 'That WiFi package is no longer available. Refresh the page and choose again.' },
          { status: 400 }
        )
      } else if (pkg.price != null) {
        monthlyPrice = Math.round(Number(pkg.price) || monthlyPrice)
      }
    }

    const totalPrice = monthlyPrice + WIFI_INSTALLATION_FEE
    const insert = {
      package_id,
      package_name,
      package_speed,
      package_price: monthlyPrice,
      installation_fee: WIFI_INSTALLATION_FEE,
      total_price: totalPrice,
      name,
      phone: normalizedPhone,
      area,
      id_number,
    }

    let { error } = await admin.from('wifi_bookings').insert(insert)

    // Older deployments do not have the fee columns. Match the chat booking
    // fallback so the public form works on any deployment.
    if (
      error &&
      /installation_fee|total_price|package_price|package_speed|package_id/i.test(
        `${error.code || ''} ${error.message || ''}`
      )
    ) {
      const base: Partial<typeof insert> = { ...insert }
      delete base.installation_fee
      delete base.total_price
      delete base.package_price
      delete base.package_speed
      delete base.package_id
      ;({ error } = await admin.from('wifi_bookings').insert(base))
    }

    if (error) {
      console.error('WiFi booking insert failed:', error)
      return NextResponse.json(
        { error: 'We could not save your WiFi request. Please try again or WhatsApp us on 0748275079.' },
        { status: 500 }
      )
    }

    const originalPrice = Number(package_original_price) || 0
    const original = originalPrice > 0 ? `KES ${originalPrice.toLocaleString()}` : null
    const discount = original && monthlyPrice ? `${Math.round((1 - monthlyPrice / originalPrice) * 100)}% off` : 'N/A'
    const features = Array.isArray(package_features)
      ? package_features.join(', ')
      : package_features || 'N/A'
    const paymentDetails = {
      Name: name,
      Area: area,
      Package: package_name || 'N/A',
      Provider: package_provider || 'N/A',
      Speed: package_speed || 'N/A',
      'Monthly Price': monthlyPrice ? `KES ${monthlyPrice.toLocaleString()}/month` : 'N/A',
      'Installation Fee': `KES ${WIFI_INSTALLATION_FEE.toLocaleString()}`,
      'Total First Payment': `KES ${totalPrice.toLocaleString()}`,
      'Original Price': original || 'N/A',
      Discount: discount,
    }

    await Promise.allSettled([
      notifyAdmins('WIFI NEEDED', 'WiFi Booking Request', {
        ...paymentDetails,
        Phone: normalizedPhone,
        'ID Number': id_number,
        Description: package_description || 'N/A',
        Features: features,
      }),
      notifyPhoneWhatsApp(
        normalizedPhone,
        'WiFi Booking Received',
        'Your WiFi request is in 📶',
        {
          ...paymentDetails,
          Status: 'We will call you to confirm installation',
        }
      ),
    ])

    return NextResponse.json({ success: true, total_price: totalPrice, installation_fee: WIFI_INSTALLATION_FEE })
  } catch (err) {
    console.error('WiFi booking route failed:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
