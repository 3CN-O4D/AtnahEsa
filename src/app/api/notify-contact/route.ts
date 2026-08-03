import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyContactDetails } from '@/lib/contact-release'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { booking_id } = await req.json()
    if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

    const result = await notifyContactDetails(booking_id)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('notify-contact error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
