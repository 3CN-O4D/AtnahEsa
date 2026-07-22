'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Clock, CheckCircle, AlertTriangle, XCircle, Eye, MessageSquare, Home, User as UserIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { Booking, Listing, EscrowHold } from '@/types'

type BookingWithDetails = Booking & {
  listing: Pick<Listing, 'id' | 'title' | 'images' | 'location' | 'price'>
  escrow_hold: EscrowHold | null
}

type Tab = 'hunter' | 'lister'

function StatusBadge({ release_status }: { release_status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'In Escrow', className: 'bg-blue-100 text-blue-700' },
    released: { label: 'Released', className: 'bg-green-100 text-green-700' },
    refunded: { label: 'Refunded', className: 'bg-amber-100 text-amber-700' },
    refund_requested: { label: 'Refund Requested', className: 'bg-red-100 text-red-700' },
    rejected: { label: 'Rejected', className: 'bg-gray-100 text-gray-600' },
  }
  const c = config[release_status] || { label: release_status, className: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}>{c.label}</span>
}

function Countdown({ held_until }: { held_until: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const update = () => {
      const diff = new Date(held_until).getTime() - Date.now()
      if (diff <= 0) { setText('Ready'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setText(`${h}h ${m}m`)
    }
    update()
    const i = setInterval(update, 30000)
    return () => clearInterval(i)
  }, [held_until])
  return <span className="text-xs text-gray-500">{text}</span>
}

export default function MyBookingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('hunter')
  const [bookings, setBookings] = useState<BookingWithDetails[]>([])
  const [listerBookings, setListerBookings] = useState<BookingWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/auth/signin'); return }
      setUser(data.user)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      setProfileRole(profile?.role || null)

      const { data: myBookings } = await supabase
        .from('bookings')
        .select('*, listing:listings!inner(*), escrow_hold:escrow_holds(*)')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })

      if (myBookings) setBookings(myBookings as unknown as BookingWithDetails[])

      if (profile?.role === 'lister' || profile?.role === 'admin') {
        const { data: listings } = await supabase
          .from('listings')
          .select('id')
          .eq('uploader_id', data.user.id)

        if (listings && listings.length > 0) {
          const listingIds = listings.map(l => l.id)
          const { data: lb } = await supabase
            .from('bookings')
            .select('*, listing:listings!inner(*), escrow_hold:escrow_holds(*)')
            .in('listing_id', listingIds)
            .order('created_at', { ascending: false })
          if (lb) setListerBookings(lb as unknown as BookingWithDetails[])
        }
      }
      setLoading(false)
    })
  }, [router])

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

  const currentBookings = tab === 'hunter' ? bookings : listerBookings
  const showListerTab = profileRole === 'lister' || profileRole === 'admin'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">My Bookings</h1>

      {showListerTab && (
        <div className="flex border rounded-lg mb-6 overflow-hidden">
          <button onClick={() => setTab('hunter')}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${tab === 'hunter' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <Eye className="w-4 h-4 inline mr-1.5" /> My Viewings
            </button>
            <button onClick={() => setTab('lister')}
              className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${tab === 'lister' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <Home className="w-4 h-4 inline mr-1.5" /> Bookings on My Houses
          </button>
        </div>
      )}

      {currentBookings.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-600 mb-1">No bookings yet</h2>
          <p className="text-sm text-gray-400 mb-4">{tab === 'hunter' ? 'Browse listings and book a viewing to get started.' : 'No one has booked your listings yet.'}</p>
          {tab === 'hunter' && (
            <Link href="/" className="text-sm text-blue-600 hover:underline">Browse Listings</Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {currentBookings.map((b) => (
            <div key={b.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex gap-4 p-4">
                <div className="w-24 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  <img src={b.listing.images?.[0] || '/placeholder.jpg'} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/booking/${b.id}`} className="font-semibold text-sm hover:text-blue-600 transition-colors line-clamp-1">
                        {b.listing.title}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">{b.listing.location}</p>
                    </div>
                    <StatusBadge release_status={b.release_status || 'pending'} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{formatPrice(b.amount)}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(b.created_at).toLocaleDateString()}</span>
                    {b.escrow_hold && b.escrow_hold.status === 'held' && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> <Countdown held_until={b.escrow_hold.held_until} /></span>
                    )}
                  </div>
                </div>
              </div>
              <div className="border-t dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {b.escrow_hold?.status === 'held' && <><CheckCircle className="w-3 h-3 text-blue-500" /> Escrow active</>}
                  {b.escrow_hold?.status === 'released' && <><CheckCircle className="w-3 h-3 text-green-500" /> Funds released</>}
                  {b.escrow_hold?.status === 'refunded' && <><XCircle className="w-3 h-3 text-amber-500" /> Refunded {b.refund_amount ? `(${formatPrice(b.refund_amount)})` : ''}</>}
                </div>
                <Link href={`/booking/${b.id}`} className="text-xs text-blue-600 hover:underline font-medium">
                  View Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
