import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { accountBalance } from '@/lib/daraja'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const hasKeys = process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_SHORTCODE
    if (!hasKeys) {
      return NextResponse.json({
        configured: false,
        message: 'Daraja keys not configured.',
      })
    }

    const result = await accountBalance()
    return NextResponse.json({ configured: true, result })
  } catch (err) {
    return NextResponse.json({ configured: true, error: 'Failed to query balance', detail: String(err) }, { status: 500 })
  }
}
