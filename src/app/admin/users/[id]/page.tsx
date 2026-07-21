import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import UserProfile from './UserProfile'
import type { Profile, Listing, Booking, Transaction } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()
  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (adminProfile?.role !== 'admin') return notFound()

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', id).single()
  if (!profile) return notFound()

  const adminSupabase = createAdminClient()
  const { data: authUser } = await adminSupabase.auth.admin.getUserById(id)
  const email = authUser?.user?.email || null

  const [listingsRes, bookingsRes, transactionsRes] = await Promise.all([
    supabase.from('listings').select('*').eq('uploader_id', id).order('created_at', { ascending: false }),
    supabase.from('bookings').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('transactions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
  ])

  const userProfile = profile as Profile
  const listings = (listingsRes.data ?? []) as Listing[]
  const bookings = (bookingsRes.data ?? []) as Booking[]
  const transactions = (transactionsRes.data ?? []) as Transaction[]

  return (
    <UserProfile
      profile={userProfile}
      listings={listings}
      bookings={bookings}
      transactions={transactions}
      email={email}
    />
  )
}
