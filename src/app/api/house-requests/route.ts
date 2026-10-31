import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { canonicalWhatsAppContact, getWhatsAppLink, isValidPhone, parseWhatsAppContact } from '@/lib/whatsapp'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type HouseRequestInsert = {
  name: string
  email: string
  phone: string
  location: string
  min_rent: number | null
  max_rent: number | null
  token_options: string[]
  water_options: string[]
  house_designs: string[]
  description: string
  whatsapp?: string
  user_id?: string
}

export async function POST(request: Request) {
  try {
    const { allowed, retryAfter } = await checkRateLimit(`house-request:${getClientIp(request)}`, 5, 300)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests from this connection. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request. Please refresh and try again.' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const location = typeof body.location === 'string' ? body.location.trim() : ''
    const rawWhatsApp = typeof body.whatsapp === 'string' ? body.whatsapp.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    const fieldErrors: Record<string, string> = {}
    if (name.length < 2) fieldErrors.name = 'Please enter your full name.'
    if (!EMAIL_RE.test(email)) fieldErrors.email = 'Please enter a valid email address.'
    if (!isValidPhone(phone)) fieldErrors.phone = 'Please enter a valid phone number, e.g. 0712 345 678.'
    if (location.length < 2) fieldErrors.location = 'Please tell us where you are looking.'
    if (description.length > 2000) fieldErrors.description = 'Please keep your details under 2,000 characters.'

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: 'Please check the highlighted fields and try again.', fieldErrors },
        { status: 400 }
      )
    }

    // WhatsApp is optional: fall back to the phone number, then normalise.
    const whatsappInput = rawWhatsApp || phone
    const whatsappTarget = parseWhatsAppContact(whatsappInput)
    if (!whatsappTarget) {
      return NextResponse.json(
        {
          error: 'That WhatsApp contact does not look right. Use a phone number like 0712 345 678 or a username like @janedoe.',
          fieldErrors: { whatsapp: 'Use a phone number or a WhatsApp username.' },
        },
        { status: 400 }
      )
    }

    const minRent = body.min_rent !== null && body.min_rent !== undefined && body.min_rent !== ''
      ? Number(body.min_rent)
      : null
    const maxRent = body.max_rent !== null && body.max_rent !== undefined && body.max_rent !== ''
      ? Number(body.max_rent)
      : null

    if ((minRent !== null && (!Number.isFinite(minRent) || minRent < 0)) ||
        (maxRent !== null && (!Number.isFinite(maxRent) || maxRent < 0))) {
      return NextResponse.json(
        { error: 'Rent amounts must be positive numbers.', fieldErrors: { min_rent: 'Enter a valid amount.' } },
        { status: 400 }
      )
    }
    if (minRent !== null && maxRent !== null && minRent > maxRent) {
      return NextResponse.json(
        { error: 'The minimum rent cannot be higher than the maximum rent.', fieldErrors: { min_rent: 'Must be lower than the maximum rent.' } },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const base: HouseRequestInsert = {
      name,
      email,
      phone,
      location,
      min_rent: minRent,
      max_rent: maxRent,
      token_options: Array.isArray(body.token_options) ? body.token_options : [],
      water_options: Array.isArray(body.water_options) ? body.water_options : [],
      house_designs: Array.isArray(body.house_designs) ? body.house_designs : [],
      description,
      ...(user ? { user_id: user.id } : {}),
    }

    // Gracefully handle databases that have not run the whatsapp / user_id
    // migrations yet.
    let whatsappSaved = true
    let { error } = await supabase.from('house_requests').insert({
      ...base,
      whatsapp: canonicalWhatsAppContact(whatsappInput) || phone,
    })

    if (error && /whatsapp/i.test(`${error.code || ''} ${error.message || ''}`)) {
      whatsappSaved = false
      const retry = await supabase.from('house_requests').insert(base)
      error = retry.error
    }

    if (error && /user_id/i.test(`${error.code || ''} ${error.message || ''}`)) {
      const { user_id: _userId, ...withoutUser } = base
      const retry = await supabase.from('house_requests').insert({
        ...withoutUser,
        whatsapp: canonicalWhatsAppContact(whatsappInput) || phone,
      })
      error = retry.error
    }

    if (error) {
      console.error('House request insert failed:', error)
      return NextResponse.json({
        error: error.message || 'We could not save your request right now. Please try again.',
      }, { status: 500 })
    }

    const tokenLabels: Record<string, string> = { self: 'Self', inclusive: 'Inclusive', either: 'Open to either' }
    const waterLabels: Record<string, string> = { included: 'Included in rent', own_borehole: 'Own borehole', either: 'Open to either' }
    const designLabels: Record<string, string> = {
      bedsitter: 'Bedsitter', studio: 'Studio', '1br': '1 Bedroom', '2br': '2 Bedroom',
      '3br': '3 Bedroom', bungalow: 'Bungalow', apartment: 'Apartment', townhouse: 'Townhouse', other: 'Other',
    }
    const tokenOptions = Array.isArray(body.token_options) ? body.token_options as string[] : []
    const waterOptions = Array.isArray(body.water_options) ? body.water_options as string[] : []
    const houseDesigns = Array.isArray(body.house_designs) ? body.house_designs as string[] : []

    const whatsappDisplay = parseWhatsAppContact(whatsappInput)?.display || whatsappInput
    const whatsappLink = getWhatsAppLink(whatsappInput)

    await notifyAdmins(
      'New House Request',
      '🏠 New House Request',
      {
        Name: name,
        Email: email,
        Phone: phone,
        WhatsApp: whatsappSaved
          ? whatsappDisplay
          : `${whatsappDisplay} (run the whatsapp migration to save this field)`,
        'WhatsApp Link': whatsappLink || 'Unavailable',
        Location: location,
        'Rent Range': minRent !== null || maxRent !== null
          ? `${minRent !== null ? `KES ${minRent.toLocaleString()}` : 'Any'} — ${maxRent !== null ? `KES ${maxRent.toLocaleString()}` : 'Any'}`
          : 'Not specified',
        Token: tokenOptions.length ? tokenOptions.map((t) => tokenLabels[t] || t).join(', ') : 'Not specified',
        Water: waterOptions.length ? waterOptions.map((w) => waterLabels[w] || w).join(', ') : 'Not specified',
        'House Design': houseDesigns.length ? houseDesigns.map((d) => designLabels[d] || d).join(', ') : 'Not specified',
        Description: description || 'None',
        Status: 'Pending',
      }
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('House request error:', err)
    return NextResponse.json({
      error: 'Something went wrong on our end. Please try again in a moment.',
    }, { status: 500 })
  }
}
