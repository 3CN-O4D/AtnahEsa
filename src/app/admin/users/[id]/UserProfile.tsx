'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Phone, Calendar, Shield, Home, BookOpen, DollarSign, Clock, CheckCircle, XCircle, RotateCcw, Star, MapPin, User as UserIcon } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatPrice } from '@/lib/utils'
import type { Profile, Listing, Booking, Transaction } from '@/types'

type Props = {
  profile: Profile
  listings: Listing[]
  bookings: Booking[]
  transactions: Transaction[]
  email: string | null
}

export default function UserProfile({ profile, listings, bookings, transactions, email }: Props) {
  const router = useRouter()
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    lister: 'bg-blue-100 text-blue-700',
    hunter: 'bg-green-100 text-green-700',
  }

  const bookingStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      pending: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Clock className="w-3 h-3" /> },
      confirmed: { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: <XCircle className="w-3 h-3" /> },
      refunded: { bg: 'bg-gray-100', text: 'text-gray-600', icon: <RotateCcw className="w-3 h-3" /> },
    }
    const s = map[status] || map.pending
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.icon} {status}</span>
  }

  const listingStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      published: 'bg-green-100 text-green-700',
      pending: 'bg-amber-100 text-amber-700',
      booked: 'bg-blue-100 text-blue-700',
      taken: 'bg-gray-100 text-gray-600',
      rejected: 'bg-red-100 text-red-700',
    }
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || map.pending}`}>{status}</span>
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </button>

      {/* Profile Header */}
      <div className="bg-white border rounded-xl p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center shrink-0 overflow-hidden">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-7 h-7 text-blue-600" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold">{profile.full_name || 'Unnamed'}</h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[profile.role] || roleColors.hunter}`}>
                <Shield className="w-3 h-3" /> {profile.role}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> @{profile.username || 'N/A'}</span>
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {email || 'N/A'}</span>
              {profile.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {profile.phone}</span>}
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Joined {new Date(profile.created_at).toLocaleDateString()}</span>
            </div>
            {profile.average_rating > 0 && (
              <div className="flex items-center gap-1 mt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-3.5 h-3.5 ${i < Math.round(profile.average_rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                ))}
                <span className="text-xs text-gray-500 ml-1">({profile.total_reviews} reviews)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Home className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Listings</span>
          </div>
          <p className="text-2xl font-bold">{listings.length}</p>
          <p className="text-sm text-gray-500">{listings.filter((l) => l.status === 'published').length} published</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <BookOpen className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Bookings</span>
          </div>
          <p className="text-2xl font-bold">{bookings.length}</p>
          <p className="text-sm text-gray-500">{bookings.filter((b) => b.status === 'confirmed').length} confirmed</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Transactions</span>
          </div>
          <p className="text-2xl font-bold">{transactions.length}</p>
          <p className="text-sm text-gray-500">{formatPrice(transactions.reduce((s, t) => s + (t.amount || 0), 0))} total</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Account Age</span>
          </div>
          <p className="text-2xl font-bold">{Math.max(1, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000))}d</p>
          <p className="text-sm text-gray-500">{new Date(profile.updated_at || profile.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Listings */}
      <div className="bg-white border rounded-xl mb-6">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Home className="w-4 h-4 text-blue-600" /> Listings ({listings.length})</h2>
        </div>
        {listings.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No listings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b">
                <th className="text-left p-2.5 font-medium">Title</th><th className="text-left p-2.5 font-medium">Price</th>
                <th className="text-left p-2.5 font-medium">Location</th><th className="text-left p-2.5 font-medium">Status</th>
                <th className="text-left p-2.5 font-medium">Created</th>
              </tr></thead>
              <tbody>{listings.map((l) => (
                <tr key={l.id} className="border-b hover:bg-gray-50">
                  <td className="p-2.5 font-medium truncate max-w-[200px]">{l.title}</td>
                  <td className="p-2.5">{formatPrice(l.price)}</td>
                  <td className="p-2.5 text-gray-600 truncate max-w-[150px]"><MapPin className="w-3 h-3 inline mr-0.5" />{l.location}</td>
                  <td className="p-2.5">{listingStatusBadge(l.status)}</td>
                  <td className="p-2.5 text-gray-500 text-xs">{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bookings */}
      <div className="bg-white border rounded-xl mb-6">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-green-600" /> Bookings ({bookings.length})</h2>
        </div>
        {bookings.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No bookings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b">
                <th className="text-left p-2.5 font-medium">#</th><th className="text-left p-2.5 font-medium">Amount</th>
                <th className="text-left p-2.5 font-medium">Status</th><th className="text-left p-2.5 font-medium">Visit</th>
                <th className="text-left p-2.5 font-medium">Release</th><th className="text-left p-2.5 font-medium">Date</th>
              </tr></thead>
              <tbody>{bookings.map((b) => (
                <tr key={b.id} className="border-b hover:bg-gray-50">
                  <td className="p-2.5 font-mono text-xs text-gray-500">{b.id.slice(0, 8)}</td>
                  <td className="p-2.5 font-medium">{formatPrice(b.amount)}</td>
                  <td className="p-2.5">{bookingStatusBadge(b.status)}</td>
                  <td className="p-2.5"><span className={`text-xs font-medium ${b.visit_status === 'completed' ? 'text-green-600' : b.visit_status === 'pending' ? 'text-amber-600' : 'text-gray-500'}`}>{b.visit_status}</span></td>
                  <td className="p-2.5 text-xs text-gray-500">{b.release_status}</td>
                  <td className="p-2.5 text-gray-500 text-xs">{new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-white border rounded-xl">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-amber-600" /> Transactions ({transactions.length})</h2>
        </div>
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No transactions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b">
                <th className="text-left p-2.5 font-medium">Receipt</th><th className="text-left p-2.5 font-medium">Amount</th>
                <th className="text-left p-2.5 font-medium">Status</th><th className="text-left p-2.5 font-medium">Message</th>
                <th className="text-left p-2.5 font-medium">Date</th>
              </tr></thead>
              <tbody>{transactions.map((tx) => (
                <tr key={tx.id} className="border-b hover:bg-gray-50">
                  <td className="p-2.5 font-mono text-xs">{tx.mpesa_receipt || tx.checkout_request_id?.slice(0, 12) || '-'}</td>
                  <td className={`p-2.5 font-medium ${tx.amount < 0 ? 'text-red-600' : ''}`}>{tx.amount < 0 ? '-' : ''}{formatPrice(Math.abs(tx.amount))}</td>
                  <td className="p-2.5">{bookingStatusBadge(tx.status)}</td>
                  <td className="p-2.5 text-gray-500 text-xs max-w-[200px] truncate">{tx.mpesa_message || '-'}</td>
                  <td className="p-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(tx.created_at).toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
