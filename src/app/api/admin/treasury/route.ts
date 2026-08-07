import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

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

  const { data: houseBookings } = await supabase
    .from('house_bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

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

  const heldHouse = (houseBookings || []).filter((h) => h.release_status === 'held')
  const pendingPayoutsAmount = heldHouse.reduce((s, h) => s + (h.listing_price || 0), 0)

  return NextResponse.json({
    stats: {
      total_escrows: (escrows?.length || 0) + (houseBookings?.length || 0),
      held: (escrows || []).filter((e) => e.status === 'held').length + heldHouse.length,
      released: (escrows || []).filter((e) => e.status === 'released').length,
      refunded: (escrows || []).filter((e) => e.status === 'refunded').length + (houseBookings || []).filter((h) => h.release_status === 'refunded').length,
      total_held_amount: totalHeld + pendingPayoutsAmount,
      total_released_amount: totalReleased,
      total_refunded_amount: totalRefunded,
      platform_revenue: platformRevenue,
      pending_payouts: heldHouse.length,
      pending_payouts_amount: pendingPayoutsAmount,
    },
    escrows: escrows || [],
    house_bookings: houseBookings || [],
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
  const { action, escrow_id, house_booking_id } = body

  if (!action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 })
  }

  if (action === 'house_release' || action === 'house_refund' || action === 'house_verify') {
    if (!house_booking_id) return NextResponse.json({ error: 'house_booking_id required' }, { status: 400 })

    const { data: hb } = await supabase.from('house_bookings').select('*').eq('id', house_booking_id).single()
    if (!hb) return NextResponse.json({ error: 'House booking not found' }, { status: 404 })
    if (hb.release_status === 'paid' || hb.release_status === 'refunded') {
      return NextResponse.json({ error: 'House booking is already processed' }, { status: 400 })
    }

    if (action === 'house_verify') {
      const method = (body.payment_method as string) || hb.payment_method || 'tuma'
      const now = new Date().toISOString()
      const heldUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

      let userId: string | null = hb.user_id || null
      if (!userId && hb.phone) {
        const digits = hb.phone.replace(/[^0-9]/g, '').slice(-9)
        const { data: profiles } = await supabase.from('profiles').select('id, phone')
        const match = (profiles || []).find((p) => p.phone && p.phone.replace(/[^0-9]/g, '').slice(-9) === digits)
        if (match) userId = match.id
      }

      const { error: e1 } = await supabase
        .from('house_bookings')
        .update({ status: 'confirmed', release_status: 'held', held_until: heldUntil, payment_method: method, user_id: userId, confirmed_at: hb.confirmed_at ?? null })
        .eq('id', house_booking_id)
      if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

      await supabase.from('transactions').insert({
        listing_id: hb.listing_id, phone: hb.phone || '', amount: hb.listing_price || 0,
        mpesa_receipt: hb.mpesa_message || '', mpesa_message: 'Payment verified by admin, placed in escrow',
        checkout_request_id: '', status: 'success', payment_method: method,
        raw_callback: { house_booking_id: house_booking_id, admin_verified: true },
      })

      const { data: listing } = await supabase
        .from('listings')
        .select('uploader_id, title')
        .eq('id', hb.listing_id)
        .maybeSingle()

      const amount = hb.listing_price || 0
      if (userId) {
        await createNotification({
          userId,
          category: 'transaction',
          title: `Payment verified — KES ${amount.toLocaleString()} now in escrow`,
          body: `Your payment for ${hb.listing_title || 'your house'} is confirmed. Contact the lister to arrange the visit.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id, amount },
        })
      }
      if (listing?.uploader_id) {
        await createNotification({
          userId: listing.uploader_id,
          category: 'linking',
          title: `A hunter paid for "${listing.title || 'your house'}"`,
          body: `Phone ${hb.phone || 'N/A'} · KES ${amount.toLocaleString()}. Verified by admin and placed in 24h escrow — call the hunter to arrange the visit.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id, hunter_phone: hb.phone, amount },
        })
      }

      return NextResponse.json({ success: true, message: `Payment verified. KES ${(hb.listing_price || 0).toLocaleString()} placed in escrow for 24h.` })
    }

    if (hb.release_status !== 'held') {
      return NextResponse.json({ error: 'House booking is not awaiting payout' }, { status: 400 })
    }

    if (action === 'house_release') {
      const { error } = await supabase
        .from('house_bookings')
        .update({ release_status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', house_booking_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await supabase.from('transactions').insert({
        listing_id: hb.listing_id, phone: hb.phone || '', amount: hb.listing_price || 0,
        mpesa_receipt: '', mpesa_message: 'Payout released to lister (house booking)',
        checkout_request_id: '', status: 'success', payment_method: hb.payment_method || 'tuma',
      })

      const { data: listing } = await supabase
        .from('listings')
        .select('uploader_id, title')
        .eq('id', hb.listing_id)
        .maybeSingle()
      if (listing?.uploader_id) {
        await createNotification({
          userId: listing.uploader_id,
          category: 'transaction',
          title: 'Payout released',
          body: `KES ${(hb.listing_price || 0).toLocaleString()} for "${listing.title || 'your house'}" has been paid to you (70%).`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id, amount: hb.listing_price },
        })
      }
      if (hb.user_id) {
        await createNotification({
          userId: hb.user_id,
          category: 'transaction',
          title: 'Your escrow was released',
          body: `Funds for ${hb.listing_title || 'your house'} were released to the lister.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id },
        })
      }

      return NextResponse.json({ success: true, message: 'Payout released to lister' })
    }

    const percentage = body.percentage ?? 85
    const refundAmount = Math.round((hb.listing_price || 0) * (percentage / 100))
    const { error } = await supabase
      .from('house_bookings')
      .update({ release_status: 'refunded', refunded_at: new Date().toISOString() })
      .eq('id', house_booking_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('transactions').insert({
      listing_id: hb.listing_id, phone: hb.phone || '', amount: refundAmount,
      mpesa_receipt: '', mpesa_message: `Admin processed ${percentage}% refund (house booking)`,
      checkout_request_id: '', status: 'success', payment_method: hb.payment_method || 'tuma',
    })

    if (hb.user_id) {
      await createNotification({
        userId: hb.user_id,
        category: 'transaction',
        title: `${percentage}% refund processed`,
        body: `KES ${refundAmount.toLocaleString()} refunded for ${hb.listing_title || 'your house'}.`,
        link: '/my-bookings?tab=payments',
        data: { house_booking_id, amount: refundAmount },
      })
    }

    return NextResponse.json({ success: true, message: `${percentage}% refund (KES ${refundAmount.toLocaleString()}) processed` })
  }

  if (!escrow_id) {
    return NextResponse.json({ error: 'escrow_id required' }, { status: 400 })
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
    const percentage = body.percentage ?? 85
    const refundAmount = Math.round((escrow.amount || 0) * (percentage / 100))
    const { error: e1 } = await supabase.from('escrow_holds').update({ status: 'refunded', refunded_at: new Date().toISOString() }).eq('id', escrow_id)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

    const { error: e2 } = await supabase.from('bookings').update({
      release_status: 'refunded', refund_percentage: percentage, refund_amount: refundAmount, refunded_at: new Date().toISOString(),
    }).eq('id', escrow.booking_id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    await supabase.from('transactions').insert({
      booking_id: escrow.booking_id, user_id: escrow.user_id, phone: '',
      amount: refundAmount, mpesa_receipt: '', mpesa_message: `Admin processed ${percentage}% refund`,
      checkout_request_id: '', status: 'success',
    })

    return NextResponse.json({ success: true, message: `${percentage}% refund (KES ${refundAmount.toLocaleString()}) processed` })
  }

  if (action === 'extend_hold') {
    const days = body.days ?? 7
    const newUntil = new Date(Date.now() + days * 86400000).toISOString()
    const { error } = await supabase.from('escrow_holds').update({ held_until: newUntil }).eq('id', escrow_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('transactions').insert({
      booking_id: escrow.booking_id, user_id: escrow.user_id, phone: '',
      amount: 0, mpesa_receipt: '', mpesa_message: `Admin extended hold by ${days} days`,
      checkout_request_id: '', status: 'success',
    })
    return NextResponse.json({ success: true, message: `Hold extended by ${days} days` })
  }

  if (action === 'reverse_tx') {
    const txId = body.transaction_id
    if (!txId) return NextResponse.json({ error: 'transaction_id required' }, { status: 400 })
    const { data: tx } = await supabase.from('transactions').select('*').eq('id', txId).single()
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    await supabase.from('transactions').insert({
      booking_id: tx.booking_id, user_id: tx.user_id, phone: tx.phone,
      amount: -tx.amount, mpesa_receipt: '', mpesa_message: `Admin reversal of ${tx.mpesa_receipt || tx.id.slice(0, 8)}`,
      checkout_request_id: '', status: 'success',
    })
    return NextResponse.json({ success: true, message: `Reversal logged for KES ${tx.amount.toLocaleString()}` })
  }

  return NextResponse.json({ error: `Invalid action '${action}'. Use release, refund, extend_hold, reverse_tx, house_release, or house_refund.` }, { status: 400 })
}
