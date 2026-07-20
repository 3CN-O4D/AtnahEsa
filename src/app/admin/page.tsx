'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { Listing, Booking, Transaction, Profile } from '@/types'

type Tab = 'stats' | 'houses' | 'transactions' | 'users'

export default function AdminDashboard() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState<Tab>('stats')
  const [loaded, setLoaded] = useState(false)
  const [allListings, setAllListings] = useState<Listing[]>([])
  const [listingsFilter, setListingsFilter] = useState('all')
  const [bookedList, setBookedList] = useState<(Listing & { booking?: Booking })[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [houseSearch, setHouseSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [stats, setStats] = useState({
    total: 0, published: 0, booked: 0, taken: 0, pending: 0,
    completed: 0, refunded: 0, withIssues: 0,
    totalRevenue: 0, totalRefunded: 0, totalListers: 0, totalHunters: 0,
  })
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }
      const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (error || profile?.role !== 'admin') { router.push('/'); return }
      setChecking(false)
      loadAll()
    })
  }, [])

  const loadAll = async () => {
    const supabase = createClient()

    const c = async (table: string, field?: string, value?: string | number) => {
      let q = supabase.from(table as any).select('*', { count: 'exact', head: true })
      if (field && value !== undefined) q = (q as any).eq(field, value)
      return (await q).count ?? 0
    }

    const total = await c('listings')
    const publishedCount = await c('listings', 'status', 'published')
    const bookedCount = await c('listings', 'status', 'booked')
    const takenCount = await c('listings', 'status', 'taken')
    const pendingCount = await c('listings', 'status', 'pending')
    const withIssues = (await supabase.from('listings').select('*', { count: 'exact', head: true }).gt('issues_count', 0)).count ?? 0

    const { data: bookings } = await supabase.from('bookings').select('amount, refund_amount, status')
    const totalRevenue = (bookings || []).filter((b) => b.status === 'confirmed').reduce((s, b) => s + (b.amount || 0), 0)
    const totalRefunded = (bookings || []).filter((b) => b.status === 'refunded').reduce((s, b) => s + (b.refund_amount || 0), 0)
    const completed = await c('bookings', 'visit_status', 'completed')
    const refunded = await c('bookings', 'visit_status', 'refunded')
    const listers = await c('profiles', 'role', 'lister')
    const hunters = await c('profiles', 'role', 'hunter')

    setStats({ total, published: publishedCount, booked: bookedCount, taken: takenCount, pending: pendingCount, completed, refunded, withIssues, totalRevenue, totalRefunded, totalListers: listers, totalHunters: hunters })
    setLoaded(true)

    loadListings()
  }

  const loadListings = async () => {
    const supabase = createClient()

    const { data: listingsData } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })

    setAllListings((listingsData ?? []) as Listing[])

    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*')
      .in('listing_id', (listingsData ?? []).map((l) => l.id))

    const bookedWithDetails = (listingsData ?? [])
      .filter((l) => l.status === 'booked')
      .map((l) => ({
        ...l,
        booking: (bookingsData ?? []).find((b) => b.listing_id === l.id),
      })) as (Listing & { booking?: Booking })[]

    setBookedList(bookedWithDetails)
  }

  const loadTransactions = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(100)
    setTransactions((data ?? []) as Transaction[])
  }

  const loadUsers = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers((data ?? []) as Profile[])
  }

  const handleDeleteListing = async (id: string) => {
    if (!confirm('Delete this listing permanently?')) return
    const supabase = createClient()

    // Fetch listing images to delete from Cloudinary
    const { data: listing } = await supabase.from('listings').select('images').eq('id', id).single()
    if (listing?.images?.length) {
      await Promise.allSettled(
        listing.images.map((url: string) =>
          fetch('/api/delete-image', { method: 'POST', body: JSON.stringify({ url }) })
        )
      )
    }

    const { error } = await supabase.from('listings').delete().eq('id', id)
    if (error) { showToast('error', error.message); return }

    // Verify deletion
    const { data: check } = await supabase.from('listings').select('id').eq('id', id).maybeSingle()
    if (check) { showToast('error', 'Delete failed — still exists. Add RLS delete policy in Supabase.'); return }

    showToast('success', 'Listing deleted')
    loadAll()
  }

  const handleMarkBooked = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('listings').update({ status: 'booked' }).eq('id', id)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'Marked as booked')
    loadAll()
  }

  const handleMarkTaken = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('listings').update({ status: 'taken' }).eq('id', id)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'Marked as taken')
    loadAll()
  }

  const handleMarkPublished = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('listings').update({ status: 'published' }).eq('id', id)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'Put back to published')
    loadAll()
  }

  const handleApprove = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('listings').update({ status: 'published' }).eq('id', id)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'Listing approved')
    loadAll()
  }

  const handleMarkCompleted = async (listingId: string, bookingId: string) => {
    const supabase = createClient()
    const { error: e1 } = await supabase.from('bookings').update({ visit_status: 'completed', status: 'confirmed' }).eq('id', bookingId)
    if (e1) { showToast('error', e1.message); return }
    const { error: e2 } = await supabase.from('listings').update({ status: 'taken' }).eq('id', listingId)
    if (e2) { showToast('error', e2.message); return }
    showToast('success', 'Visit marked as completed')
    loadAll()
  }

  const handleProcessRefund = async (listingId: string, bookingId: string, amount: number) => {
    const supabase = createClient()
    const refundAmount = Math.round(amount * 0.6)
    const { error: e1 } = await supabase.from('bookings').update({ status: 'refunded', visit_status: 'refunded', refund_amount: refundAmount, refunded_at: new Date().toISOString() }).eq('id', bookingId)
    if (e1) { showToast('error', e1.message); return }
    const { error: e2 } = await supabase.from('listings').update({ status: 'published' }).eq('id', listingId)
    if (e2) { showToast('error', e2.message); return }
    showToast('success', 'Refund processed')
    loadAll()
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Delete this user? Cannot be undone.')) return
    const supabase = createClient()
    const { error } = await supabase.from('profiles').delete().eq('id', userId)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'User deleted')
    loadUsers()
  }

  const handleUpdateUserRole = async (userId: string, role: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) { showToast('error', error.message); return }
    showToast('success', 'User role updated')
    loadUsers()
  }

  const statCard = (label: string, value: number | string, color: string, filter?: string) => (
    <button
      onClick={() => { setTab('houses'); setListingsFilter(filter || 'all') }}
      className={`bg-white border rounded-xl p-4 text-left hover:shadow-md transition-shadow ${filter ? 'cursor-pointer' : ''}`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{typeof value === 'number' ? value : value}</p>
    </button>
  )

  const filteredListings = (listingsFilter === 'all' ? allListings
    : listingsFilter === 'booked' ? allListings.filter((l) => l.status === 'booked')
    : listingsFilter === 'pending' ? allListings.filter((l) => l.status === 'pending')
    : listingsFilter === 'published' ? allListings.filter((l) => l.status === 'published')
    : listingsFilter === 'taken' ? allListings.filter((l) => l.status === 'taken')
    : listingsFilter === 'issues' ? allListings.filter((l) => l.issues_count > 0)
    : allListings
  ).filter((l) => {
    if (!houseSearch) return true
    const q = houseSearch.toLowerCase()
    const num = parseInt(houseSearch)
    return (
      l.title?.toLowerCase().includes(q) ||
      l.location?.toLowerCase().includes(q) ||
      (!isNaN(num) && (l.price === num || l.rent === num))
    )
  })

  if (checking) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/admin/upload">
            <Button size="sm">+ List House</Button>
          </Link>
          <Link href="/admin/services">
            <Button size="sm" variant="outline">Services</Button>
          </Link>
          <a href="/api/payments/reports?format=pdf" target="_blank" className="text-sm text-blue-600 hover:underline self-center">
            Download Payment Report
          </a>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <Button variant={tab === 'stats' ? 'primary' : 'outline'} size="sm" onClick={() => setTab('stats')}>Dashboard</Button>
        <Button variant={tab === 'houses' ? 'primary' : 'outline'} size="sm" onClick={() => { setTab('houses'); setListingsFilter('all') }}>Houses ({allListings.length})</Button>
        <Button variant={tab === 'transactions' ? 'primary' : 'outline'} size="sm" onClick={() => { setTab('transactions'); loadTransactions() }}>Transactions</Button>
        <Button variant={tab === 'users' ? 'primary' : 'outline'} size="sm" onClick={() => { setTab('users'); loadUsers() }}>Users ({users.length})</Button>
      </div>

      {tab === 'stats' && (
        !loaded ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCard('Total Houses', stats.total, 'text-gray-900', 'all')}
            {statCard('Published', stats.published, 'text-green-600', 'published')}
            {statCard('Booked', stats.booked, 'text-blue-600', 'booked')}
            {statCard('Taken', stats.taken, 'text-purple-600', 'taken')}
            {statCard('Pending Review', stats.pending, 'text-amber-600', 'pending')}
            {statCard('Completed Visits', stats.completed, 'text-green-600')}
            {statCard('Refunded', stats.refunded, 'text-red-600')}
            {statCard('With Issues', stats.withIssues, 'text-amber-600', 'issues')}
            {statCard('Revenue', formatPrice(stats.totalRevenue), 'text-green-600')}
            {statCard('Refunded Amount', formatPrice(stats.totalRefunded), 'text-red-600')}
            {statCard('Listers', stats.totalListers, 'text-blue-600')}
            {statCard('Hunters', stats.totalHunters, 'text-blue-600')}
          </div>
        )
      )}

      {tab === 'houses' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'published', 'booked', 'taken', 'issues'].map((f) => (
              <button
                key={f}
                onClick={() => setListingsFilter(f)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  listingsFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} {f === 'all' ? `(${allListings.length})` : `(${allListings.filter(l => f === 'issues' ? l.issues_count > 0 : l.status === f).length})`}
              </button>
            ))}
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={houseSearch}
              onChange={(e) => setHouseSearch(e.target.value)}
              placeholder="Search by title, location, price, rent..."
              className="w-full pl-10 pr-4 h-10 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {filteredListings.length === 0 && <p className="text-gray-500 text-center py-8">No listings.</p>}

          {filteredListings.map((listing) => (
            <div key={listing.id} className="bg-white border rounded-xl p-4 flex items-start gap-4">
              <img src={listing.images[0] || '/placeholder.jpg'} alt="" className="w-20 h-16 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{listing.title}</h3>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    listing.status === 'published' ? 'bg-green-100 text-green-700' :
                    listing.status === 'booked' ? 'bg-blue-100 text-blue-700' :
                    listing.status === 'taken' ? 'bg-purple-100 text-purple-700' :
                    listing.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>{listing.status}</span>
                </div>
                <p className="text-sm text-gray-500">{listing.location}</p>
                <p className="text-sm text-gray-500">Charge: {formatPrice(listing.price)} | Rent: {formatPrice(listing.rent)}</p>
                <p className="text-xs text-gray-400">By: {listing.uploader_name} | {new Date(listing.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <Link href={`/admin/listings/${listing.id}`}><Button variant="outline" size="sm">Edit</Button></Link>
                {listing.status === 'pending' && <Button size="sm" onClick={() => handleApprove(listing.id)}>Approve</Button>}
                {listing.status === 'published' && <Button size="sm" onClick={() => handleMarkBooked(listing.id)}>Mark Booked</Button>}
                {listing.status === 'booked' && <Button size="sm" onClick={() => handleMarkTaken(listing.id)}>Mark Taken</Button>}
                {listing.status === 'taken' && <Button size="sm" variant="outline" onClick={() => handleMarkPublished(listing.id)}>Put Back</Button>}
                <Button size="sm" variant="danger" onClick={() => handleDeleteListing(listing.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">All Transactions</h2>
            <a href="/api/payments/reports?format=pdf" target="_blank" className="text-sm text-blue-600 hover:underline">Download PDF</a>
          </div>
          {transactions.length === 0 && <p className="text-gray-500 text-center py-8">No transactions yet.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b">
                <th className="text-left p-3 font-medium">Receipt</th><th className="text-left p-3 font-medium">Phone</th>
                <th className="text-left p-3 font-medium">Amount</th><th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Date</th>
              </tr></thead>
              <tbody>{transactions.map((tx) => (
                <tr key={tx.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{tx.mpesa_receipt || '-'}</td>
                  <td className="p-3">{tx.phone}</td>
                  <td className="p-3 font-medium">{formatPrice(tx.amount)}</td>
                  <td className="p-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.status === 'success' ? 'bg-green-100 text-green-700' :
                      tx.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>{tx.status}</span>
                  </td>
                  <td className="p-3 text-gray-500">{new Date(tx.created_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <Input label="" id="user-search" placeholder="Search by name, email, or phone..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="max-w-sm" />
          {users.length === 0 && <p className="text-gray-500 text-center py-8">No users.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b">
                <th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Username</th>
                <th className="text-left p-3 font-medium">Phone</th><th className="text-left p-3 font-medium">Role</th>
                <th className="text-left p-3 font-medium">Joined</th><th className="text-left p-3 font-medium">Actions</th>
              </tr></thead>
              <tbody>{users
                .filter((u) => !userSearch || (u.full_name?.toLowerCase() || '').includes(userSearch.toLowerCase()) || (u.username?.toLowerCase() || '').includes(userSearch.toLowerCase()) || (u.phone || '').includes(userSearch))
                .map((u) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{u.full_name}</td>
                  <td className="p-3 text-gray-600">{u.username}</td>
                  <td className="p-3">{u.phone || '-'}</td>
                  <td className="p-3">
                    <select value={u.role} onChange={(e) => handleUpdateUserRole(u.id, e.target.value)} className="text-xs border rounded px-1 py-0.5">
                      <option value="hunter">Hunter</option>
                      <option value="lister">Lister</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="p-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="p-3 flex gap-1">
                    <Link href={`/admin/users/${u.id}`}><Button size="sm" variant="outline">View</Button></Link>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteUser(u.id)}>Delete</Button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}