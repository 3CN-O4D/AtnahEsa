import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSecurityHeaders } from '@/lib/security'
import { OWNER_SHARE } from '@/lib/constants'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const [
    { count: total },
    { count: published },
    { count: booked },
    { count: taken },
    { count: pending },
    { count: rejected },
    { count: vacant },
    { count: vacancyPending },
    { count: withIssues },
    { count: completed },
    { count: refunded },
    { count: listers },
    { count: hunters },
    { count: totalUsers },
    { count: movers },
    { count: wifiPkgs },
    { count: wifiBkgs },
    { count: contacts },
    { count: houseReqs },
    { count: pendingReqs },
    { count: reports },
    { count: complaintsOpen },
    { count: complaintsTotal },
  ] = await Promise.all([
    admin.from('listings').select('*', { count: 'exact', head: true }),
    admin.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    admin.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'booked'),
    admin.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'taken'),
    admin.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    admin.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('vacancy', 'vacant'),
    admin.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('vacancy', 'pending'),
    admin.from('listings').select('*', { count: 'exact', head: true }).gt('issues_count', 0),
    admin.from('bookings').select('*', { count: 'exact', head: true }).eq('visit_status', 'completed'),
    admin.from('bookings').select('*', { count: 'exact', head: true }).eq('visit_status', 'refunded'),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'lister'),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'hunter'),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('movers').select('*', { count: 'exact', head: true }),
    admin.from('wifi_packages').select('*', { count: 'exact', head: true }),
    admin.from('wifi_bookings').select('*', { count: 'exact', head: true }),
    admin.from('contact_submissions').select('*', { count: 'exact', head: true }),
    admin.from('house_requests').select('*', { count: 'exact', head: true }),
    admin.from('house_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('reports').select('*', { count: 'exact', head: true }),
    admin.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('complaints').select('*', { count: 'exact', head: true }),
  ])

  const [{ data: bookings }, { data: escrows }, { data: txns }, { data: houseBkgs }] = await Promise.all([
    admin.from('bookings').select('id, amount, refund_amount, status'),
    admin.from('escrow_holds').select('booking_id, amount, status'),
    admin.from('transactions').select('amount, status, payment_method, raw_callback'),
    admin.from('house_bookings').select('id, listing_price, release_status, status, payment_method'),
  ])

  type LegacyBooking = {
    id: string
    amount: number | null
    refund_amount: number | null
    status: string | null
  }
  type LegacyEscrow = {
    booking_id: string | null
    amount: number | null
    status: string | null
  }
  type TxRow = {
    amount: number | null
    status: string | null
    payment_method: string | null
    raw_callback: Record<string, unknown> | null
  }
  type HouseRow = {
    id: string
    listing_price: number | null
    release_status: string | null
    status: string | null
    payment_method: string | null
  }

  const bookingList = (bookings || []) as LegacyBooking[]
  const escrowList = (escrows || []) as LegacyEscrow[]
  const txList = (txns || []) as TxRow[]
  const houseList = (houseBkgs || []) as HouseRow[]

  const sum = <T,>(rows: T[], pick: (row: T) => number | null | undefined) =>
    rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0)

  const bookingById = new Map(bookingList.map((b) => [b.id, b]))
  const refundAmountByBooking = new Map<string, number>()
  const payoutAmountByBooking = new Map<string, number>()
  const incomingTxs: TxRow[] = []

  for (const tx of txList) {
    const callback = tx.raw_callback || {}
    const linkedId =
      typeof callback.house_booking_id === 'string' ? callback.house_booking_id : null
    const isPayout = tx.payment_method === 'payout' || callback.payout === true
    const isRefund = tx.payment_method === 'refund' || callback.refund === true

    if (isPayout && linkedId) {
      payoutAmountByBooking.set(
        linkedId,
        (payoutAmountByBooking.get(linkedId) || 0) + Math.abs(Number(tx.amount) || 0)
      )
    } else if (isRefund && linkedId) {
      refundAmountByBooking.set(
        linkedId,
        (refundAmountByBooking.get(linkedId) || 0) + Math.abs(Number(tx.amount) || 0)
      )
    } else if (!isPayout && !isRefund) {
      incomingTxs.push(tx)
    }
  }

  // Legacy bookings: count money actually collected (confirmed or later
  // refunded), not only rows still sitting on "confirmed".
  const legacyCollected = bookingList.filter(
    (b) => b.status === 'confirmed' || b.status === 'refunded'
  )
  const legacyCollectedAmount = sum(legacyCollected, (b) => b.amount)
  const legacyRefundedAmount = sum(
    bookingList.filter((b) => b.status === 'refunded'),
    (b) => b.refund_amount
  )

  const legacyHeld = escrowList.filter((e) => e.status === 'held')
  const legacyReleased = escrowList.filter((e) => e.status === 'released')
  const legacyRefunded = escrowList.filter((e) => e.status === 'refunded')

  const legacyRefundAmount = (e: LegacyEscrow) => {
    const bookingRefund = e.booking_id ? bookingById.get(e.booking_id)?.refund_amount : null
    return bookingRefund != null ? Number(bookingRefund) : Math.round((Number(e.amount) || 0) * 0.85)
  }

  // House bookings are the modern payment record. Held, paid and refunded rows
  // all represent money that actually arrived.
  const houseCollected = houseList.filter((h) =>
    ['held', 'paid', 'released', 'refunded'].includes(h.release_status || '')
  )
  const heldHouse = houseList.filter((h) => h.release_status === 'held')
  const paidHouse = houseList.filter(
    (h) => h.release_status === 'paid' || h.release_status === 'released'
  )
  const refundedHouse = houseList.filter((h) => h.release_status === 'refunded')
  const completedHouse = houseList.filter((h) => h.status === 'completed')

  const housePayoutFor = (h: HouseRow) =>
    payoutAmountByBooking.get(h.id) ?? Math.round((Number(h.listing_price) || 0) * OWNER_SHARE)
  const houseRefundFor = (h: HouseRow) =>
    refundAmountByBooking.get(h.id) ?? Math.round((Number(h.listing_price) || 0) * 0.85)

  const houseRevenue = sum(houseCollected, (h) => h.listing_price)
  const houseRevenueCount = houseCollected.length
  const houseRefunded = sum(refundedHouse, houseRefundFor)
  const houseRefundedCount = refundedHouse.length

  const pendingPayouts = heldHouse.length
  const pendingPayoutsAmount = sum(heldHouse, (h) =>
    Math.round((Number(h.listing_price) || 0) * OWNER_SHARE)
  )

  const totalRevenue = legacyCollectedAmount + houseRevenue
  const totalRefunded = legacyRefundedAmount + houseRefunded
  const netRevenue = totalRevenue - totalRefunded

  // Platform keeps its commission on completed payouts and the part of a
  // refund that was not returned to the hunter.
  const legacyCommission = sum(
    legacyReleased,
    (e) => (Number(e.amount) || 0) - Math.round((Number(e.amount) || 0) * OWNER_SHARE)
  )
  const legacyRefundRetained = sum(
    legacyRefunded,
    (e) => (Number(e.amount) || 0) - legacyRefundAmount(e)
  )
  const houseCommission = sum(
    paidHouse,
    (h) => (Number(h.listing_price) || 0) - housePayoutFor(h)
  )
  const houseRefundRetained = sum(
    refundedHouse,
    (h) => (Number(h.listing_price) || 0) - houseRefundFor(h)
  )
  const platformRevenue =
    legacyCommission + legacyRefundRetained + houseCommission + houseRefundRetained

  const escrowHeld = legacyHeld.length + heldHouse.length
  const escrowHeldAmount =
    sum(legacyHeld, (e) => e.amount) + sum(heldHouse, (h) => h.listing_price)

  const methodMap: Record<string, { count: number; amount: number }> = {}
  for (const t of incomingTxs) {
    if (t.status !== 'success' || !(Number(t.amount) > 0)) continue
    const m = String(t.payment_method || 'paywave').toLowerCase()
    methodMap[m] = methodMap[m] || { count: 0, amount: 0 }
    methodMap[m].count += 1
    methodMap[m].amount += Number(t.amount)
  }
  const paymentsByMethod = Object.entries(methodMap).map(([method, v]) => ({ method, ...v }))

  const successfulTransactions = incomingTxs.filter(
    (t) => t.status === 'success' && Number(t.amount) > 0
  ).length
  const failedTransactions = incomingTxs.filter((t) => t.status === 'failed').length

  return NextResponse.json({
    total, published, booked, taken, pending, rejected,
    vacant, vacancyPending, withIssues,
    completed: (completed ?? 0) + completedHouse.length,
    refunded: (refunded ?? 0) + refundedHouse.length,
    listers, hunters, totalUsers,
    movers, wifiPkgs, wifiBkgs, contacts, houseReqs, reports,
    pendingRequests: pendingReqs ?? 0,
    complaintsOpen: complaintsOpen ?? 0,
    complaintsTotal: complaintsTotal ?? 0,
    // Shapes the dashboard already expects.
    totalListers: listers ?? 0,
    totalHunters: hunters ?? 0,
    totalMovers: movers ?? 0,
    wifiPackages: wifiPkgs ?? 0,
    wifiBookings: wifiBkgs ?? 0,
    contactSubmissions: contacts ?? 0,
    houseRequests: houseReqs ?? 0,
    totalRevenue, totalRefunded, netRevenue,
    successfulTransactions, failedTransactions,
    escrowHeld, escrowHeldAmount,
    houseRevenue, houseRevenueCount, houseRefunded, houseRefundedCount,
    platformRevenue,
    pendingPayouts, pendingPayoutsAmount, paymentsByMethod,
  })
}
