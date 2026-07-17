'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit3, Trash2, Plus, Home, MapPin, Eye, Calendar, ArrowLeft, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { Listing } from '@/types'

export default function MyListingsPage() {
  const router = useRouter()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }

      const { data } = await supabase
        .from('listings')
        .select('*')
        .eq('uploader_id', user.id)
        .order('created_at', { ascending: false })

      setListings((data ?? []) as Listing[])
      setLoading(false)
    })
  }, [router])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return
    setDeleting(id)

    const supabase = createClient()
    const { error } = await supabase.from('listings').delete().eq('id', id)

    if (error) {
      alert('Failed to delete: ' + error.message)
    } else {
      setListings(listings.filter((l) => l.id !== id))
    }
    setDeleting(null)
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      published: 'bg-green-100 text-green-700',
      booked: 'bg-blue-100 text-blue-700',
      taken: 'bg-gray-100 text-gray-600',
      rejected: 'bg-red-100 text-red-700',
    }
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Listings</h1>
          <p className="text-sm text-gray-500">{listings.length} house{listings.length !== 1 ? 's' : ''} listed</p>
        </div>
        <Link href="/upload">
          <Button><Plus className="w-4 h-4 mr-1.5" /> List New House</Button>
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-16 bg-white border rounded-xl">
          <Home className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-600 mb-2">No listings yet</h2>
          <p className="text-sm text-gray-400 mb-6">Start by listing your first house</p>
          <Link href="/upload"><Button>List Your House</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => (
            <div key={listing.id} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row">
                {listing.images.length > 0 && (
                  <div className="sm:w-48 h-36 shrink-0">
                    <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">{listing.title}</h3>
                      {statusBadge(listing.status)}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <MapPin className="w-3.5 h-3.5" /> {listing.location}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-blue-600 font-semibold">{formatPrice(listing.rent)}/mo</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600">Fee: {formatPrice(listing.price)}</span>
                      {listing.house_type && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-600">{listing.house_type}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Link href={`/my-listings/edit/${listing.id}`}>
                      <Button variant="outline" size="sm"><Edit3 className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(listing.id)} loading={deleting === listing.id} className="text-red-600 border-red-200 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                    {listing.status === 'published' && (
                      <Link href={`/listings/${listing.id}`} className="text-blue-600 text-sm hover:underline ml-auto flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> View <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
