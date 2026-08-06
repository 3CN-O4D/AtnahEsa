'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, CheckCircle2, MapPin, Banknote, Droplets, Home as HomeIcon, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'

type PublicRequest = {
  id: string
  location: string
  min_rent: number | null
  max_rent: number | null
  token_options: string[]
  water_options: string[]
  house_designs: string[]
  deposit_preference: string[]
  deposit_refundable: string[]
  building_type: string[]
  house_type_requested: string[]
  electric_bill: string[]
  vacancy: string[]
  description: string
  status: 'pending' | 'contacted' | 'fulfilled' | 'closed'
  claimed_by: string | null
  claimed_at: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  contacted: { label: 'Contacted', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  fulfilled: { label: 'Fulfilled', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  closed: { label: 'Closed', className: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}

const LABELS: Record<string, string> = {
  self: 'Self-contained',
  inclusive: 'Inclusive',
  either: 'Open to either',
  included: 'Water included',
  own_borehole: 'Own borehole',
  bedsitter: 'Bedsitter',
  studio: 'Studio',
  '1br': '1 Bedroom',
  '2br': '2 Bedroom',
  '3br': '3 Bedroom',
  bungalow: 'Bungalow',
  apartment: 'Apartment',
  townhouse: 'Townhouse',
  other: 'Other',
  required: 'Deposit required',
  not_required: 'No deposit',
  refundable: 'Refundable',
  non_refundable: 'Non-refundable',
  flat: 'Ground floor',
  storey: 'Storey',
  self_provided: 'Self provided',
  vacant: 'Vacant now',
  any: 'Any time',
}

function joinLabels(ids: string[] | null | undefined): string {
  if (!ids || !ids.length) return ''
  return ids.map((i) => LABELS[i] || i).join(', ')
}

export default function RequestsPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [requests, setRequests] = useState<PublicRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'contacted' | 'closed'>('all')

  const loadRequests = async () => {
    setLoading(true)
    const supabase = createClient()
    // Prefer the public-safe view. Fall back to the raw table (admin-only,
    // since RLS blocks listers) if the view hasn't been created yet.
    const { data: viewData, error: viewError } = await supabase
      .from('house_requests_public')
      .select('*')
      .order('created_at', { ascending: false })

    if (viewError) {
      const { data: raw } = await supabase
        .from('house_requests')
        .select('id, location, min_rent, max_rent, token_options, water_options, house_designs, deposit_preference, deposit_refundable, building_type, house_type_requested, electric_bill, vacancy, description, status, claimed_by, claimed_at, created_at')
        .order('created_at', { ascending: false })
      setRequests((raw ?? []) as PublicRequest[])
    } else {
      setRequests((viewData ?? []) as PublicRequest[])
    }
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/auth/signin'); return }
      setUser(data.user)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      const role = profile?.role ?? null
      if (role !== 'lister' && role !== 'admin') {
        router.push('/forbidden')
        return
      }
      await loadRequests()
    })
  }, [])

  const handleClaim = async (id: string) => {
    setClaimingId(id)
    setError('')
    try {
      const res = await fetch(`/api/house-requests/${id}/claim`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to claim request'); setClaimingId(null); return }
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, claimed_by: user?.id ?? null, claimed_at: new Date().toISOString() } : r))
    } catch {
      setError('Something went wrong')
    } finally { setClaimingId(null) }
  }

  const filtered = requests.filter((r) => filter === 'all' || r.status === filter)
  const openCount = requests.filter((r) => r.status === 'pending').length

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">House Requests</h1>
          <p className="text-sm text-gray-500 dark:text-white">
            People looking for houses. Claim a request when you have a matching house — we&apos;ll connect you.
          </p>
        </div>
        <span className="text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full px-3 py-1">
          {openCount} open request{openCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 text-sm mb-5 w-fit">
        {([['all', 'All'], ['pending', 'Pending'], ['contacted', 'Contacted'], ['closed', 'Closed']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === key ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-white dark:hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-start gap-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-xs text-gray-500 dark:text-white">
        <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
        <p>For lister privacy, requesters&apos; names, phone numbers, and emails are hidden. When you claim a request, our team contacts the requester on your behalf.</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</p>}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-white">
          <HomeIcon className="w-10 h-10 mx-auto mb-2" />
          <p>No house requests here yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => {
            const claimedByMe = user && r.claimed_by === user.id
            const claimedByOther = r.claimed_by && !claimedByMe
            const status = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
            return (
              <div key={r.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">{r.location}</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>{status.label}</span>
                    {claimedByMe && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"><CheckCircle2 className="w-3 h-3" /> Claimed by you</span>}
                    {claimedByOther && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-white">Taken</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
                  <div className="flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500 dark:text-white">Rent:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {r.min_rent || r.max_rent ? `${formatPrice(r.min_rent || 0)} — ${formatPrice(r.max_rent || 0)}` : 'Any'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HomeIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500 dark:text-white">Design:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{joinLabels(r.house_designs) || 'Any'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Droplets className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500 dark:text-white">Water:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{joinLabels(r.water_options) || 'Any'}</span>
                  </div>
                  {!!r.token_options?.length && (
                    <div className="text-gray-500 dark:text-white">Token: <span className="font-medium text-gray-900 dark:text-white">{joinLabels(r.token_options)}</span></div>
                  )}
                  {!!r.deposit_preference?.length && (
                    <div className="text-gray-500 dark:text-white">Deposit: <span className="font-medium text-gray-900 dark:text-white">{joinLabels(r.deposit_preference)}</span></div>
                  )}
                  {!!r.building_type?.length && (
                    <div className="text-gray-500 dark:text-white">Type: <span className="font-medium text-gray-900 dark:text-white">{joinLabels(r.building_type)}</span></div>
                  )}
                </div>

                {r.description && (
                  <p className="text-sm text-gray-600 dark:text-white bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3 mb-3">{r.description}</p>
                )}

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-gray-400 dark:text-white">Requested {new Date(r.created_at).toLocaleDateString()}</p>
                  <div className="flex gap-2">
                    {claimedByOther ? (
                      <span className="text-xs text-gray-400 dark:text-white px-3 py-2">Another lister has taken this</span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleClaim(r.id)}
                          disabled={!!claimingId}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {claimingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {claimedByMe ? 'Claimed — I have a house' : 'I have this house'}
                        </button>
                        <Link href="/upload" className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          Upload House
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
