import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminSupabase = createAdminClient()

  const c = async (table: string, field?: string, value?: string | number) => {
    let q = adminSupabase.from(table as any).select('*', { count: 'exact', head: true })
    if (field && value !== undefined) q = (q as any).eq(field, value)
    return (await q).count ?? 0
  }

  const [
    total, published, booked, taken, pending,
    vacant, vacancyPending, withIssues,
    completed, refunded, listers, hunters, totalUsers,
    movers, wifiPkgs, wifiBkgs, contacts, houseReqs, reports,
  ] = await Promise.all([
    c('listings'),
    c('listings', 'status', 'published'),
    c('listings', 'status', 'booked'),
    c('listings', 'status', 'taken'),
    c('listings', 'status', 'pending'),
    adminSupabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('vacancy', 'vacant').then((r) => r.count ?? 0),
    adminSupabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('vacancy', 'pending').then((r) => r.count ?? 0),
    adminSupabase.from('listings').select('id', { count: 'exact', head: true }).gt('issues_count', 0).then((r) => r.count ?? 0),
    c('bookings', 'visit_status', 'completed'),
    c('bookings', 'visit_status', 'refunded'),
    c('profiles', 'role', 'lister'),
    c('profiles', 'role', 'hunter'),
    c('profiles'),
    c('movers'),
    c('wifi_packages'),
    c('wifi_bookings'),
    c('contact_submissions'),
    c('house_requests'),
    c('reports'),
  ])

  const [{ data: bookings }, { data: escrows }, { data: txns }, { data: houseBkgs }] = await Promise.all([
    adminSupabase.from('bookings').select('amount, refund_amount, status'),
    adminSupabase.from('escrow_holds').select('amount, status'),
    adminSupabase.from('transactions').select('amount, status, payment_method'),
    adminSupabase.from('house_bookings').select('listing_price, release_status, payment_method'),
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
    const m = String(t.payment_method || 'daraja_till').toLowerCase()
    methodMap[m] = methodMap[m] || { count: 0, amount: 0 }
    methodMap[m].count += 1
    methodMap[m].amount += t.amount
  }
  const paymentsByMethod = Object.entries(methodMap).map(([method, v]) => ({ method, ...v }))

  return NextResponse.json({
    total, published, booked, taken, pending,
    vacant, vacancyPending, withIssues,
    completed, refunded, listers, hunters, totalUsers,
    movers, wifiPkgs, wifiBkgs, contacts, houseReqs, reports,
    totalRevenue, totalRefunded, escrowHeld, escrowHeldAmount,
    houseRevenue, houseRevenueCount, houseRefunded, houseRefundedCount,
    pendingPayouts, pendingPayoutsAmount, paymentsByMethod,
  })
}
