import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, phone, email, id_number, location, message } = body

    if (!name || !phone || !email || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase.from('contact_submissions').insert({
      name,
      phone,
      email,
      id_number,
      location,
      message,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await notifyAdmins(
      'New Contact Submission',
      'Contact Form Submission',
      { Name: name, Phone: phone, Email: email, 'ID Number': id_number, Location: location, Message: message || 'N/A' }
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
