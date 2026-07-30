'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { Listing, Booking, Transaction, Profile, HouseRequest } from '@/types'
import { getCached, setCache, clearCache } from '@/lib/data-cache'

export default function AdminDashboard() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>}>
      <AdminDashboardInner />
    </Suspense>
  )
}

function AdminDashboardInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'stats'
  const [loaded, setLoaded] = useState(false)
  const [allListings, setAllListings] = useState<Listing[]>([])
  const [listingsFilter, setListingsFilter] = useState('all')
  const [bookedList, setBookedList] = useState<(Listing & { booking?: Booking })[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [houseSearch, setHouseSearch] = useState('')
  const [requests, setRequests] = useState<HouseRequest[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [stats, setStats] = useState({
    total: 0, published: 0, booked: 0, taken: 0, pending: 0, vacant: 0, vacancyPending: 0,
    completed: 0, refunded: 0, withIssues: 0,
    totalRevenue: 0, totalRefunded: 0, totalListers: 0, totalHunters: 0, totalUsers: 0,
    totalMovers: 0, wifiPackages: 0, wifiBookings: 0,
    contactSubmissions: 0, houseRequests: 0, reports: 0,
    escrowHeld: 0, escrowHeldAmount: 0,
  })
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const notifyUser = useCallback(async (to: string, action: string, data: Record<string, string>) => {
    try { await fetch('/api/admin/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, action, data }) }) } catch {}
  }, [])

  const notifyUserById = useCallback(async (userId: string, action: string, data: Record<string, string>) => {
    try { await fetch('/api/admin/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action, data }) }) } catch {}
  }, [])

  useEffect(() => { loadAll(); loadListings() }, [])

  useEffect(() => {
    if (tab === 'transactions') loadTransactions()
    if (tab === 'users') loadUsers()
    if (tab === 'requests') loadRequests()
  }, [tab])

  async function loadAll() {
    const cached = getCached<typeof stats>('admin:stats')
    if (cached) { setStats(cached); setLoaded(true); return }

    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStats(data as typeof stats)
      setCache('admin:stats', data)
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
    setLoaded(true)
  }

  async function loadListings() {
    const cached = getCached<{ all: Listing[]; booked: (Listing & { booking?: Booking })[] }>('admin:listings')
    if (cached) { setAllListings(cached.all); setBookedList(cached.booked); return }

    try {
      const res = await fetch('/api/admin/listings')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const listings = (data ?? []) as Listing[]
      setAllListings(listings)

      if (listings.length > 0) {
        const supabase = createClient()
        const { data: bookingsData } = await supabase
          .from('bookings')
          .select('id, listing_id, user_id, amount, phone, status, visit_status, release_status, refund_amount, created_at')
          .in('listing_id', listings.map((l) => l.id))

        const booked = listings
          .filter((l) => l.status === 'booked')
          .map((l) => ({
            ...l,
            booking: (bookingsData ?? []).find((b) => b.listing_id === l.id),
          })) as (Listing & { booking?: Booking })[]

        setCache('admin:listings', { all: listings, booked })
        setBookedList(booked)
      } else {
        setBookedList([])
      }
    } catch (err) {
      console.error('Failed to load listings:', err)
    }
  }

  const loadTransactions = async () => {
    const cached = getCached<Transaction[]>('admin:transactions')
    if (cached) { setTransactions(cached); return }
    const supabase = createClient()
    const { data } = await supabase.from('transactions').select('id, booking_id, user_id, phone, amount, mpesa_receipt, mpesa_message, checkout_request_id, status, created_at').order('created_at', { ascending: false }).limit(100)
    const result = (data ?? []) as Transaction[]
    setCache('admin:transactions', result)
    setTransactions(result)
  }

  const loadRequests = async () => {
    const cached = getCached<HouseRequest[]>('admin:requests')
    if (cached) { setRequests(cached); return }
    const supabase = createClient()
    const { data } = await supabase.from('house_requests').select('*').order('created_at', { ascending: false })
    const result = (data ?? []) as HouseRequest[]
    setCache('admin:requests', result)
    setRequests(result)
  }

  const handleUpdateRequestStatus = async (id: string, status: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('house_requests').update({ status }).eq('id', id)
    if (error) { showToast('error', error.message); return }
    showToast('success', `Request marked as ${status}`)
    const reqData = requests.find((r) => r.id === id)
    if (reqData?.email) notifyUser(reqData.email, 'request_contacted', { name: reqData.name, location: reqData.location || 'N/A', status })
    clearCache('admin:'); loadRequests()
  }

  const loadUsers = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers((data ?? []) as Profile[])
  }

  const handleDeleteListing = async (id: string) => {
    if (!confirm('Delete this listing permanently?')) return

    // Fetch listing images to delete from Cloudinary
    const listing = allListings.find((l) => l.id === id)
    if (listing?.images?.length) {
      await Promise.allSettled(
        listing.images.map((url: string) =>
          fetch('/api/delete-image', { method: 'POST', body: JSON.stringify({ url }) })
        )
      )
    }

    const res = await fetch(`/api/admin/listings/${id}`, { method: 'DELETE' })
    if (!res.ok) { showToast('error', 'Delete failed'); return }

    showToast('success', 'Listing deleted')
    if (listing?.uploader_id) notifyUserById(listing.uploader_id, 'listing_deleted', { title: listing.title || 'Unknown', reason: 'Removed by admin' })
    clearCache('admin:'); loadAll()
  }

  const handleMarkBooked = async (id: string) => {
    const res = await fetch(`/api/admin/listings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'booked' }),
    })
    if (!res.ok) { showToast('error', 'Failed to mark as booked'); return }
    showToast('success', 'Marked as booked')
    const listing = allListings.find((l) => l.id === id)
    if (listing?.uploader_id) notifyUserById(listing.uploader_id, 'listing_booked', { title: listing.title, location: listing.location, date: new Date().toLocaleDateString(), phone: listing.lister_phone || 'N/A' })
    clearCache('admin:'); loadAll()
  }

  const handleMarkTaken = async (id: string) => {
    const name = prompt('Who took this house? (Enter name):')
    if (!name || !name.trim()) return
    const res = await fetch(`/api/admin/listings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'taken', taken_by_name: name.trim(), taken_at: new Date().toISOString() }),
    })
    if (!res.ok) { showToast('error', 'Failed to mark as taken'); return }
    showToast('success', 'Marked as taken')
    const listing = allListings.find((l) => l.id === id)
    if (listing?.uploader_id) notifyUserById(listing.uploader_id, 'listing_taken', { title: listing.title, location: listing.location })
    clearCache('admin:'); loadAll()
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    const res = await fetch(`/api/admin/listings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    })
    if (!res.ok) { showToast('error', 'Failed to reject listing'); return }
    showToast('success', 'Listing rejected')
    const listing = allListings.find((l) => l.id === id)
    if (listing?.uploader_id) notifyUserById(listing.uploader_id, 'listing_rejected', { title: listing.title, reason })
    clearCache('admin:'); loadAll()
  }

  const handleMarkPublished = async (id: string) => {
    const res = await fetch(`/api/admin/listings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    })
    if (!res.ok) { showToast('error', 'Failed to publish listing'); return }
    showToast('success', 'Put back to published')
    const listing = allListings.find((l) => l.id === id)
    if (listing?.uploader_id) notifyUserById(listing.uploader_id, 'listing_approved', { title: listing.title, location: listing.location, url: `${window.location.origin}/listings/${id}` })
    loadAll()
  }

  const handleApprove = async (id: string) => {
    const res = await fetch(`/api/admin/listings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    })
    if (!res.ok) { showToast('error', 'Failed to approve listing'); return }
    showToast('success', 'Listing approved')
    const listing = allListings.find((l) => l.id === id)
    if (listing?.uploader_id) notifyUserById(listing.uploader_id, 'listing_approved', { title: listing.title, location: listing.location, url: `${window.location.origin}/listings/${id}` })
    clearCache('admin:'); loadAll()
  }

  const handleMarkCompleted = async (listingId: string, bookingId: string) => {
    const supabase = createClient()
    const { error: e1 } = await supabase.from('bookings').update({ visit_status: 'completed', status: 'confirmed' }).eq('id', bookingId)
    if (e1) { showToast('error', e1.message); return }
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'taken' }),
    })
    if (!res.ok) { showToast('error', 'Failed to mark listing as taken'); return }
    showToast('success', 'Visit marked as completed')
    const listing = allListings.find((l) => l.id === listingId)
    const booking = bookedList.find((l) => l.id === listingId)?.booking
    if (listing?.uploader_id) notifyUserById(listing.uploader_id, 'booking_completed', { title: listing.title || 'Property', status: 'Completed' })
    if (booking?.user_id) notifyUserById(booking.user_id, 'booking_completed', { title: listing?.title || 'Property', status: 'Completed' })
    clearCache('admin:'); loadAll()
  }

  const handleProcessRefund = async (listingId: string, bookingId: string, amount: number) => {
    const supabase = createClient()
    const refundAmount = Math.round(amount * 0.6)
    const { error: e1 } = await supabase.from('bookings').update({ status: 'refunded', visit_status: 'refunded', refund_amount: refundAmount, refunded_at: new Date().toISOString() }).eq('id', bookingId)
    if (e1) { showToast('error', e1.message); return }
    const { data: escrow } = await supabase.from('escrow_holds').select('id').eq('booking_id', bookingId).maybeSingle()
    if (escrow) {
      await supabase.from('escrow_holds').update({ status: 'refunded', refunded_at: new Date().toISOString() }).eq('id', escrow.id)
    }
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    })
    if (!res.ok) { showToast('error', 'Failed to publish listing after refund'); return }
    showToast('success', 'Refund processed')
    const listing = allListings.find((l) => l.id === listingId)
    const bookingEntry = bookedList.find((l) => l.id === listingId)?.booking
    if (bookingEntry?.user_id) notifyUserById(bookingEntry.user_id, 'refund_processed', { title: listing?.title || 'Property', amount: `KES ${refundAmount.toLocaleString()}` })
    clearCache('admin:'); loadAll()
  }

  const handleUpdateYoutubeUrl = async (listingId: string, youtubeUrls: string | string[]) => {
    const update: Record<string, unknown> = {}
    if (typeof youtubeUrls === 'string') {
      update.youtube_url = youtubeUrls
      update.youtube_urls = [youtubeUrls]
    } else {
      update.youtube_urls = youtubeUrls
      update.youtube_url = youtubeUrls[0] || null
    }
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (!res.ok) { showToast('error', 'Failed to save YouTube URL'); return }
    showToast('success', 'YouTube URL saved')
    clearCache('admin:'); loadAll()
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Delete this user? Cannot be undone.')) return
    const userProfile = users.find((u) => u.id === userId)
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { showToast('error', data.error || 'Failed to delete user'); return }
    showToast('success', 'User deleted')
    if (userId) notifyUserById(userId, 'account_deleted', { name: userProfile?.full_name || userProfile?.username || 'User' })
    clearCache('admin:'); loadUsers()
  }

  const handleUpdateUserRole = async (userId: string, role: string) => {
    const userProfile = users.find((u) => u.id === userId)
    const oldRole = userProfile?.role || 'unknown'
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    const data = await res.json()
    if (!res.ok) { showToast('error', data.error || 'Failed to update role'); return }
    showToast('success', 'User role updated')
    if (userId) notifyUserById(userId, 'role_changed', { old_role: oldRole, new_role: role })
    clearCache('admin:'); loadUsers()
  }

  const handleToggleVerified = async (userId: string, currentVerified: boolean) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, verified: !currentVerified }),
    })
    const data = await res.json()
    if (!res.ok) { showToast('error', data.error || 'Failed to toggle verified'); return }
    showToast('success', `User ${currentVerified ? 'unverified' : 'verified'}`)
    clearCache('admin:'); loadUsers()
  }

  const statCard = (label: string, value: number | string, color: string, link?: string) => (
    <button
      onClick={() => { if (link) router.push(link) }}
      className={`bg-white border dark:border-gray-700 rounded-xl p-4 text-left hover:shadow-md transition-shadow ${link ? 'cursor-pointer' : ''}`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{typeof value === 'number' ? value : value}</p>
    </button>
  )

  const sectionTitle = (title: string, emoji: string) => (
    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2 col-span-full mt-6 first:mt-0">
      <span className="text-xl">{emoji}</span> {title}
    </h3>
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold dark:text-white">Admin Dashboard</h1>
        <a href="/api/payments/reports?format=pdf" target="_blank" className="text-sm text-blue-600 hover:underline">
          Download Payment Report
        </a>
      </div>

      <div className="flex gap-1 flex-wrap mb-6 border-b border-gray-200 dark:border-gray-700 pb-1">
        {[
          { key: 'stats', label: 'Stats' },
          { key: 'houses', label: 'Houses' },
          { key: 'videos', label: 'Videos' },
          { key: 'transactions', label: 'Transactions' },
          { key: 'requests', label: 'Requests' },
          { key: 'users', label: 'Users' },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'stats' && (
        !loaded ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sectionTitle('Approval Stats', '📋')}
            {statCard('Awaiting Approval', stats.pending, 'text-amber-600', '/admin?tab=houses')}
            {statCard('Published', stats.published, 'text-green-600', '/admin?tab=houses')}
            {statCard('Rejected / Issues', stats.withIssues, 'text-red-600', '/admin?tab=houses')}

            {sectionTitle('Vacancy Stats', '🏠')}
            {statCard('Total Houses', stats.total, 'text-gray-900', '/admin?tab=houses')}
            {statCard('Vacant Houses', stats.vacant, 'text-green-600', '/admin?tab=houses')}
            {statCard('Pending (Vacancy)', stats.vacancyPending, 'text-yellow-600', '/admin?tab=houses')}
            {statCard('Booked', stats.booked, 'text-blue-600', '/admin?tab=houses')}
            {statCard('Taken', stats.taken, 'text-purple-600', '/admin?tab=houses')}

            {sectionTitle('People', '👥')}
            {statCard('Total Users', stats.totalUsers, 'text-gray-900', '/admin?tab=users')}
            {statCard('Listers', stats.totalListers, 'text-blue-600', '/admin?tab=users')}
            {statCard('Hunters', stats.totalHunters, 'text-green-600', '/admin?tab=users')}
            {statCard('House Requests', stats.houseRequests, 'text-amber-600', '/admin?tab=requests')}

            {sectionTitle('Bookings & Revenue', '💰')}
            {statCard('Completed Visits', stats.completed, 'text-green-600')}
            {statCard('Refunded', stats.refunded, 'text-red-600')}
            {statCard('Revenue', formatPrice(stats.totalRevenue), 'text-green-600')}
            {statCard('Refunded Amount', formatPrice(stats.totalRefunded), 'text-red-600')}

            {sectionTitle('Services', '📡')}
            {statCard('Movers', stats.totalMovers, 'text-blue-600', '/admin/services')}
            {statCard('WiFi Packages', stats.wifiPackages, 'text-green-600', '/admin/services')}
            {statCard('WiFi Bookings', stats.wifiBookings, 'text-amber-600', '/admin/services')}

            {sectionTitle('Inquiries', '📬')}
            {statCard('Contact Messages', stats.contactSubmissions, 'text-blue-600')}
            {statCard('Pending Requests', stats.houseRequests, 'text-amber-600', '/admin?tab=requests')}
            {statCard('Reports', stats.reports, 'text-red-600')}

            {sectionTitle('Treasury', '🏦')}
            {statCard('Escrow Held', stats.escrowHeld, 'text-blue-600', '/admin/treasury')}
            {statCard('Held Amount', formatPrice(stats.escrowHeldAmount), 'text-amber-600', '/admin/treasury')}

            {/* Quick Actions */}
            <div className="col-span-full mt-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="text-xl">⚡</span> Quick Actions
              </h3>
              <div className="flex flex-wrap gap-3">
                <Link href="/admin/upload"><Button className="bg-blue-600 hover:bg-blue-700 text-white">+ List a House</Button></Link>
                <Link href="/admin/services"><Button variant="outline">Manage Services</Button></Link>
                <Link href="/admin/treasury"><Button variant="outline">Treasury</Button></Link>
                <Link href="/admin?tab=requests"><Button variant="outline">House Requests</Button></Link>
                <a href="/api/payments/reports?format=pdf" target="_blank"><Button variant="outline">Download Report</Button></a>
              </div>
            </div>
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
                  listingsFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-300'
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
              className="w-full pl-10 pr-4 h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {filteredListings.length === 0 && <p className="text-gray-500 text-center py-8">No listings.</p>}

          {filteredListings.map((listing) => (
            <div key={listing.id} className="bg-white border dark:border-gray-700 rounded-xl p-4 flex items-start gap-4">
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
                {listing.status === 'pending' && <Button size="sm" variant="danger" onClick={() => handleReject(listing.id)}>Reject</Button>}
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
              <thead><tr className="bg-gray-50 border-b dark:border-gray-700">
                <th className="text-left p-3 font-medium">Receipt</th><th className="text-left p-3 font-medium">Phone</th>
                <th className="text-left p-3 font-medium">Amount</th><th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Date</th>
              </tr></thead>
              <tbody>{transactions.map((tx) => (
                <tr key={tx.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-200">
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

      {tab === 'requests' && (
        <div className="space-y-4">
          {requests.length === 0 && <p className="text-gray-500 text-center py-8">No house requests yet.</p>}
          {requests.map((r) => (
            <div key={r.id} className="bg-white border dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{r.name}</h3>
                  <p className="text-sm text-gray-500">{r.email} &middot; {r.phone}</p>
                </div>
                <select
                  value={r.status}
                  onChange={(e) => handleUpdateRequestStatus(r.id, e.target.value)}
                  className={`text-xs border rounded px-2 py-1 font-medium ${
                    r.status === 'pending' ? 'text-amber-700 bg-amber-50 border-amber-200' :
                    r.status === 'contacted' ? 'text-blue-700 bg-blue-50 border-blue-200' :
                    r.status === 'fulfilled' ? 'text-green-700 bg-green-50 border-green-200' :
                    'text-gray-700 bg-gray-50 border-gray-200'
                  }`}
                >
                  <option value="pending">Pending</option>
                  <option value="contacted">Contacted</option>
                  <option value="fulfilled">Fulfilled</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div><span className="text-gray-500">Location:</span> <span className="font-medium">{r.location}</span></div>
                <div><span className="text-gray-500">Rent:</span> <span className="font-medium">{r.min_rent || r.max_rent ? `KES ${(r.min_rent || 0).toLocaleString()} — KES ${(r.max_rent || 0).toLocaleString()}` : 'Any'}</span></div>
                <div><span className="text-gray-500">Token:</span> <span className="font-medium">{(r.token_options || []).join(', ') || 'Any'}</span></div>
                <div><span className="text-gray-500">Water:</span> <span className="font-medium">{(r.water_options || []).join(', ') || 'Any'}</span></div>
                <div><span className="text-gray-500">Design:</span> <span className="font-medium">{(r.house_designs || []).join(', ') || 'Any'}</span></div>
                <div><span className="text-gray-500">Date:</span> <span className="font-medium">{new Date(r.created_at).toLocaleDateString()}</span></div>
              </div>
              {r.description && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3">{r.description}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'videos' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Video Review</h2>
          {(() => {
            const hasVideo = (l: typeof allListings[number]) => {
              const urls = l.video_urls?.length ? l.video_urls : (l.video_url ? [l.video_url] : [])
              const ytUrls = l.youtube_urls?.length ? l.youtube_urls : (l.youtube_url ? [l.youtube_url] : [])
              return urls.length > ytUrls.length
            }
            const videoListings = allListings.filter(hasVideo)
            if (videoListings.length === 0) return <p className="text-gray-500 text-center py-8">No videos awaiting review.</p>
            return videoListings.map((listing) => {
              const urls = listing.video_urls?.length ? listing.video_urls : (listing.video_url ? [listing.video_url] : [])
              const ytUrls = listing.youtube_urls?.length ? listing.youtube_urls : (listing.youtube_url ? [listing.youtube_url] : [])
              const pending = urls.filter((_, i) => !ytUrls[i])
              return (
              <div key={listing.id} className="bg-white border dark:border-gray-700 rounded-xl p-4">
                <div className="flex items-start gap-4 mb-3">
                  <img src={listing.images[0] || '/placeholder.jpg'} alt="" className="w-20 h-16 rounded-lg object-cover shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">{listing.title}</h3>
                    <p className="text-sm text-gray-500">{listing.location} &mdash; {pending.length} video{pending.length !== 1 ? 's' : ''} pending</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {pending.map((vurl, vi) => (
                    <div key={vi} className="flex items-center gap-3 pl-2 border-l-2 border-blue-400">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 truncate">Video {vi + 1}</p>
                        <div className="flex gap-2 mt-1">
                          <a href={vurl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Preview</a>
                          <a href={`/api/video?key=${encodeURIComponent(vurl.split('/object/public/')[1]?.split('/').slice(1).join('/').split('?')[0] || vurl)}`} download className="text-xs text-gray-500 hover:underline">Download</a>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Paste YouTube URL..."
                        id={`yt-${listing.id}-${vi}`}
                        className="w-64 rounded-lg border border-gray-300 dark:border-gray-600 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={() => {
                    const yts: string[] = []
                    for (let i = 0; i < pending.length; i++) {
                      const input = document.getElementById(`yt-${listing.id}-${i}`) as HTMLInputElement
                      yts.push(input?.value || '')
                    }
                    const allYt = [...ytUrls, ...yts].filter(Boolean)
                    handleUpdateYoutubeUrl(listing.id, allYt)
                  }}>Save All YouTube URLs</Button>
                </div>
              </div>
            )})
          })()}
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <Input label="" id="user-search" placeholder="Search by name, email, or phone..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="max-w-sm" />
          {users.length === 0 && <p className="text-gray-500 text-center py-8">No users.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b dark:border-gray-700">
                <th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Username</th>
                <th className="text-left p-3 font-medium">Phone</th><th className="text-left p-3 font-medium">Role</th>
                <th className="text-left p-3 font-medium">Verified</th><th className="text-left p-3 font-medium">Joined</th><th className="text-left p-3 font-medium">Actions</th>
              </tr></thead>
              <tbody>{users
                .filter((u) => !userSearch || (u.full_name?.toLowerCase() || '').includes(userSearch.toLowerCase()) || (u.username?.toLowerCase() || '').includes(userSearch.toLowerCase()) || (u.phone || '').includes(userSearch))
                .map((u) => (
                <tr key={u.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-200">
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
                  <td className="p-3">
                    <button
                      onClick={() => handleToggleVerified(u.id, !!u.verified)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        u.verified ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {u.verified ? 'Verified' : 'Not Verified'}
                    </button>
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