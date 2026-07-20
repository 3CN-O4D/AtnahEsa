import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: escrows } = await supabase
    .from('escrow_holds')
    .select('*, booking:bookings(*), listing:listings(title)')
    .order('created_at', { ascending: false })

  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const totalHeld = (escrows || []).filter((e) => e.status === 'held').reduce((s, e) => s + (e.amount || 0), 0)
  const totalReleased = (escrows || []).filter((e) => e.status === 'released').reduce((s, e) => s + (e.amount || 0), 0)
  const totalRefunded = (escrows || []).filter((e) => e.status === 'refunded').reduce((s, e) => s + (e.amount || 0), 0)
  const platformRevenue = (escrows || [])
    .filter((e) => e.status === 'released')
    .reduce((s, e) => s + Math.round((e.amount || 0) * 0.3), 0)

  return NextResponse.json({
    stats: {
      total_escrows: escrows?.length || 0,
      held: (escrows || []).filter((e) => e.status === 'held').length,
      released: (escrows || []).filter((e) => e.status === 'released').length,
      refunded: (escrows || []).filter((e) => e.status === 'refunded').length,
      total_held_amount: totalHeld,
      total_released_amount: totalReleased,
      total_refunded_amount: totalRefunded,
      platform_revenue: platformRevenue,
    },
    escrows: escrows || [],
    transactions: recentTransactions || [],
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { action, escrow_id } = body

  if (!action || !escrow_id) {
    return NextResponse.json({ error: 'action and escrow_id required' }, { status: 400 })
  }

  const { data: escrow } = await supabase.from('escrow_holds').select('*').eq('id', escrow_id).single()
  if (!escrow) return NextResponse.json({ error: 'Escrow not found' }, { status: 404 })

  if (action === 'release') {
    const { error: e1 } = await supabase.from('escrow_holds').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', escrow_id)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

    const { error: e2 } = await supabase.from('bookings').update({ release_status: 'released' }).eq('id', escrow.booking_id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    await supabase.from('transactions').insert({
      booking_id: escrow.booking_id, user_id: escrow.user_id, phone: '',
      amount: escrow.amount, mpesa_receipt: '', mpesa_message: 'Admin released to lister',
      checkout_request_id: '', status: 'success',
    })

    return NextResponse.json({ success: true, message: 'Funds released to lister' })
  }

  if (action === 'refund') {
    const refundAmount = Math.round((escrow.amount || 0) * 0.85)
    const { error: e1 } = await supabase.from('escrow_holds').update({ status: 'refunded', refunded_at: new Date().toISOString() }).eq('id', escrow_id)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

    const { error: e2 } = await supabase.from('bookings').update({
      release_status: 'refunded', refund_percentage: 85, refund_amount: refundAmount, refunded_at: new Date().toISOString(),
    }).eq('id', escrow.booking_id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    await supabase.from('transactions').insert({
      booking_id: escrow.booking_id, user_id: escrow.user_id, phone: '',
      amount: refundAmount, mpesa_receipt: '', mpesa_message: 'Admin processed 85% refund',
      checkout_request_id: '', status: 'success',
    })

    return NextResponse.json({ success: true, message: `85% refund (KES ${refundAmount.toLocaleString()}) processed` })
  }

  return NextResponse.json({ error: 'Invalid action. Use release or refund.' }, { status: 400 })
}
