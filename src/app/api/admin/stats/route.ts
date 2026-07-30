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

  const [{ data: bookings }, { data: escrows }] = await Promise.all([
    adminSupabase.from('bookings').select('amount, refund_amount, status'),
    adminSupabase.from('escrow_holds').select('amount, status'),
  ])

  const totalRevenue = (bookings || []).filter((b: any) => b.status === 'confirmed').reduce((s: number, b: any) => s + (b.amount || 0), 0)
  const totalRefunded = (bookings || []).filter((b: any) => b.status === 'refunded').reduce((s: number, b: any) => s + (b.refund_amount || 0), 0)
  const escrowHeld = (escrows || []).filter((e: any) => e.status === 'held').length
  const escrowHeldAmount = (escrows || []).filter((e: any) => e.status === 'held').reduce((s: number, e: any) => s + (e.amount || 0), 0)

  return NextResponse.json({
    total, published, booked, taken, pending,
    vacant, vacancyPending, withIssues,
    completed, refunded, listers, hunters, totalUsers,
    movers, wifiPkgs, wifiBkgs, contacts, houseReqs, reports,
    totalRevenue, totalRefunded, escrowHeld, escrowHeldAmount,
  })
}
