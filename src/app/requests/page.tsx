'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  Droplets,
  Home as HomeIcon,
  Inbox,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { getWhatsAppLink } from '@/lib/whatsapp'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'

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

type FilterKey = 'all' | 'pending' | 'contacted' | 'fulfilled' | 'closed'

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/60', dot: 'bg-amber-500' },
  contacted: { label: 'Contacted', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/60', dot: 'bg-blue-500' },
  fulfilled: { label: 'Fulfilled', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/60', dot: 'bg-emerald-500' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700', dot: 'bg-gray-400' },
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

function RequestSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="h-5 w-40 rounded skeleton" />
        <div className="h-6 w-20 rounded-full skeleton" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-4 rounded skeleton" />)}
      </div>
      <div className="h-16 rounded-xl skeleton" />
      <div className="flex justify-between">
        <div className="h-4 w-24 rounded skeleton" />
        <div className="h-9 w-36 rounded-lg skeleton" />
      </div>
    </div>
  )
}

export default function RequestsPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [requests, setRequests] = useState<PublicRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [contactLoadingId, setContactLoadingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      // Prefer the public-safe view. Fall back to the raw table (admin-only,
      // since RLS blocks listers) if the view hasn't been created yet.
      const { data: viewData, error: viewError } = await supabase
        .from('house_requests_public')
        .select('*')
        .order('created_at', { ascending: false })

      if (viewError) {
        const { data: raw, error: rawError } = await supabase
          .from('house_requests')
          .select('id, location, min_rent, max_rent, token_options, water_options, house_designs, deposit_preference, deposit_refundable, building_type, house_type_requested, electric_bill, vacancy, description, status, claimed_by, claimed_at, created_at')
          .order('created_at', { ascending: false })
        if (rawError) throw rawError
        setRequests((raw ?? []) as PublicRequest[])
      } else {
        setRequests((viewData ?? []) as PublicRequest[])
      }
    } catch {
      setError('We could not load house requests. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push(signInUrl(currentPathWithSearch())); return }
      setUser(data.user)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      const role = profile?.role ?? null
      if (role !== 'lister' && role !== 'admin') {
        router.push('/forbidden')
        return
      }
      await loadRequests()
    })
  }, [router, loadRequests])

  const handleClaim = async (id: string) => {
    setClaimingId(id)
    setError('')
    try {
      const res = await fetch(`/api/house-requests/${id}/claim`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'We could not claim this request. Please try again.')
        return
      }
      setRequests((prev) => prev.map((r) => r.id === id ? {
        ...r,
        claimed_by: data.claimed_by ?? user?.id ?? null,
        claimed_at: data.claimed_at ?? new Date().toISOString(),
      } : r))
    } catch {
      setError('We could not reach the server. Check your connection and try again.')
    } finally {
      setClaimingId(null)
    }
  }

  const handleWhatsApp = async (r: PublicRequest) => {
    setContactLoadingId(r.id)
    setError('')
    // Open the tab synchronously so mobile browsers don't block it after the fetch.
    const tab = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
    try {
      const res = await fetch(`/api/house-requests/${r.id}/contact`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        tab?.close()
        setError(data.error || 'We could not open this contact. Please try again.')
        return
      }
      const firstName = (data.name || 'there').split(' ')[0]
      const link = getWhatsAppLink(
        data.whatsapp,
        `Hi ${firstName}, this is AseHanta. I have a house that may match your request in ${r.location}. Is it okay if I share the details?`
      )
      if (!link) {
        tab?.close()
        setError('This requester has not provided a valid WhatsApp contact yet. Please contact the admin team.')
        return
      }
      if (tab) tab.location.assign(link)
      else window.location.assign(link)
    } catch {
      tab?.close()
      setError('We could not reach the server. Check your connection and try again.')
    } finally {
      setContactLoadingId(null)
    }
  }

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    contacted: requests.filter((r) => r.status === 'contacted').length,
    fulfilled: requests.filter((r) => r.status === 'fulfilled').length,
    closed: requests.filter((r) => r.status === 'closed').length,
  }), [requests])

  const filtered = useMemo(
    () => requests.filter((r) => filter === 'all' || r.status === filter),
    [requests, filter]
  )

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'fulfilled', label: 'Fulfilled' },
    { key: 'closed', label: 'Closed' },
  ]

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="h-8 w-52 rounded skeleton mb-3" />
        <div className="h-4 w-72 rounded skeleton mb-8" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => <RequestSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-28 -right-24 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl" />

      <div className="relative max-w-3xl mx-auto px-4 py-8">
        <button onClick={() => router.back()} className="group inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" /> Back
        </button>

        <header className="rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-gradient-to-br from-white via-white to-blue-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40 p-5 sm:p-6 shadow-sm mb-5 animate-fadeIn">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                <Inbox className="w-3.5 h-3.5" /> Lister marketplace
              </span>
              <h1 className="mt-2.5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">House requests</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-xl">
                Real people looking for homes. Claim a request when you have a match, then message them on WhatsApp.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-white/80 dark:bg-slate-800/80 border border-gray-200 dark:border-gray-700 px-3 py-2 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{counts.pending}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1">Open</p>
              </div>
              <div className="rounded-xl bg-white/80 dark:bg-slate-800/80 border border-gray-200 dark:border-gray-700 px-3 py-2 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{counts.all}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1">Total</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-white/70 dark:bg-slate-800/60 border border-gray-200/80 dark:border-gray-700 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <p>Contact details stay hidden until you claim a request. After claiming, you can message the requester directly on WhatsApp.</p>
          </div>
        </header>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
          {filters.map(({ key, label }) => {
            const active = filter === key
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium border transition-all ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                    : 'bg-white/80 dark:bg-slate-900/80 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'}`}>
                  {counts[key]}
                </span>
              </button>
            )
          })}
        </div>

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 mb-4 text-sm text-red-700 dark:text-red-300 animate-shake">
            <span>{error}</span>
            <button onClick={loadRequests} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-700 px-2.5 py-1 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-slate-900/60 py-14 px-6 text-center animate-fadeIn">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-4">
              <HomeIcon className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">No {filter === 'all' ? '' : filter} requests here yet</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              {filter === 'all'
                ? 'When someone asks us to find a house, their request will appear here.'
                : 'Try a different filter to see other requests.'}
            </p>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')} className="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Show all requests
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((r, index) => {
              const claimedByMe = !!user && r.claimed_by === user.id
              const claimedByOther = !!r.claimed_by && !claimedByMe
              const status = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
              const isClosed = r.status === 'closed' || r.status === 'fulfilled'
              return (
                <article
                  key={r.id}
                  className="group relative overflow-hidden rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg animate-fadeIn"
                  style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${status.dot} opacity-80`} />

                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shrink-0">
                        <MapPin className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">{r.location}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> Requested {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} /> {status.label}
                      </span>
                      {claimedByMe && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" /> Claimed by you
                        </span>
                      )}
                      {claimedByOther && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          Taken
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Banknote className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-gray-500 dark:text-gray-400">Rent:</span>
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {r.min_rent || r.max_rent ? `${formatPrice(r.min_rent || 0)} — ${formatPrice(r.max_rent || 0)}` : 'Any'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <HomeIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-gray-500 dark:text-gray-400">Design:</span>
                      <span className="font-medium text-gray-900 dark:text-white truncate">{joinLabels(r.house_designs) || 'Any'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Droplets className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-gray-500 dark:text-gray-400">Water:</span>
                      <span className="font-medium text-gray-900 dark:text-white truncate">{joinLabels(r.water_options) || 'Any'}</span>
                    </div>
                    {!!r.token_options?.length && (
                      <div className="text-gray-500 dark:text-gray-400">Token: <span className="font-medium text-gray-900 dark:text-white">{joinLabels(r.token_options)}</span></div>
                    )}
                    {!!r.deposit_preference?.length && (
                      <div className="text-gray-500 dark:text-gray-400">Deposit: <span className="font-medium text-gray-900 dark:text-white">{joinLabels(r.deposit_preference)}</span></div>
                    )}
                    {!!r.building_type?.length && (
                      <div className="text-gray-500 dark:text-gray-400">Type: <span className="font-medium text-gray-900 dark:text-white">{joinLabels(r.building_type)}</span></div>
                    )}
                  </div>

                  {r.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50/80 dark:bg-slate-800/60 border border-gray-100 dark:border-gray-700/60 rounded-xl p-3 mb-4 leading-relaxed">
                      {r.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                    {isClosed || claimedByOther ? (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {r.status === 'closed' ? 'This request is closed' : r.status === 'fulfilled' ? 'This request has been fulfilled' : 'Another lister has taken this'}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Verified listers only
                      </span>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {claimedByMe && !isClosed && (
                        <button
                          onClick={() => handleWhatsApp(r)}
                          disabled={contactLoadingId === r.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-sm"
                        >
                          {contactLoadingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                          WhatsApp
                        </button>
                      )}

                      {!claimedByMe && !claimedByOther && !isClosed && (
                        <>
                          <button
                            onClick={() => handleClaim(r.id)}
                            disabled={!!claimingId}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                          >
                            {claimingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            I have this house
                          </button>
                          <Link href="/upload" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <Upload className="w-4 h-4" /> Upload
                          </Link>
                        </>
                      )}

                      {claimedByMe && !isClosed && (
                        <Link href="/upload" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <Upload className="w-4 h-4" /> Upload house
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
