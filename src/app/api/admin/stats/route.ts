import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSecurityHeaders } from '@/lib/security'

export async function GET() {
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
    { count: reports },
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
    admin.from('reports').select('*', { count: 'exact', head: true }),
  ])

  const [{ data: bookings }, { data: escrows }, { data: txns }, { data: houseBkgs }] = await Promise.all([
    admin.from('bookings').select('amount, refund_amount, status'),
    admin.from('escrow_holds').select('amount, status'),
    admin.from('transactions').select('amount, status, payment_method'),
    admin.from('house_bookings').select('listing_price, release_status, payment_method'),
  ])

  const totalRevenue = (bookings || []).filter((b: any) => b.status === 'confirmed').reduce((s: number, b: any) => s + (b.amount || 0), 0)
  const totalRefunded = (bookings || []).filter((b: any) => b.status === 'refunded').reduce((s: number, b: any) => s + (b.refund_amount || 0), 0)
  const escrowHeld = (escrows || []).filter((e: any) => e.status === 'held').length
  const escrowHeldAmount = (escrows || []).filter((e: any) => e.status === 'held').reduce((s: number, e: any) => s + (e.amount || 0), 0)

  const heldHouse = (houseBkgs || []).filter((h: any) => h.release_status === 'held')
  const paidHouse = (houseBkgs || []).filter((h: any) => h.release_status === 'paid')
  const refundedHouse = (houseBkgs || []).filter((h: any) => h.release_status === 'refunded')

  const houseRevenueCount = heldHouse.length + paidHouse.length
  const houseRevenue = [...heldHouse, ...paidHouse].reduce((s: number, h: any) => s + (h.listing_price || 0), 0)
  const houseRefundedCount = refundedHouse.length
  const houseRefunded = refundedHouse.reduce((s: number, h: any) => s + Math.round((h.listing_price || 0) * 0.85), 0)
  const pendingPayouts = heldHouse.length
  const pendingPayoutsAmount = heldHouse.reduce((s: number, h: any) => s + (h.listing_price || 0), 0)

  const methodMap: Record<string, { count: number; amount: number }> = {}
  for (const t of (txns || []) as any[]) {
    if (t.status !== 'success' || !(t.amount > 0)) continue
    const m = String(t.payment_method || 'paywave').toLowerCase()
    methodMap[m] = methodMap[m] || { count: 0, amount: 0 }
    methodMap[m].count += 1
    methodMap[m].amount += t.amount
  }
  const paymentsByMethod = Object.entries(methodMap).map(([method, v]) => ({ method, ...v }))

  return NextResponse.json({
    total, published, booked, taken, pending, rejected,
    vacant, vacancyPending, withIssues,
    completed, refunded, listers, hunters, totalUsers,
    movers, wifiPkgs, wifiBkgs, contacts, houseReqs, reports,
    totalRevenue, totalRefunded, escrowHeld, escrowHeldAmount,
    houseRevenue, houseRevenueCount, houseRefunded, houseRefundedCount,
    pendingPayouts, pendingPayoutsAmount, paymentsByMethod,
  })
}
