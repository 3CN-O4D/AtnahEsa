'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Clock,
  Home as HomeIcon,
  KeyRound,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react'
import ListingGrid from '@/components/listings/ListingGrid'
import SearchBar from '@/components/listings/SearchBar'
import SortDropdown from '@/components/listings/SortDropdown'
import FilterPanel from '@/components/listings/FilterPanel'
import Reveal from '@/components/ui/Reveal'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { useCountUp } from '@/hooks/useCountUp'
import type { Listing } from '@/types'

const HOW_IT_WORKS = [
  {
    icon: Search,
    title: 'Find a home that fits',
    body: 'Filter by location, rent and budget. Every listing shows real photos, videos and honest costs before you commit.',
  },
  {
    icon: ShieldCheck,
    title: 'Book safely',
    body: 'Your booking fee is held securely. View the house first, then confirm — with a clear refund policy if it is not what was promised.',
  },
  {
    icon: KeyRound,
    title: 'Move in, get connected',
    body: 'Once you confirm, the lister is revealed and we help you sort movers and WiFi so day one feels effortless.',
  },
]

const TRUST_POINTS = [
  { icon: BadgeCheck, label: 'Verified listings' },
  { icon: Wallet, label: 'Protected booking fee' },
  { icon: MessageCircle, label: 'Direct WhatsApp support' },
]

const FEATURES = [
  {
    icon: BadgeCheck,
    title: 'No more fake listings',
    body: 'Homes are checked before they go live, with real photos, videos and the actual bills you will pay.',
  },
  {
    icon: Wallet,
    title: 'Money held safely',
    body: 'Booking fees sit in escrow until you have viewed the house. If it is not as described, you can request a refund.',
  },
  {
    icon: MessageCircle,
    title: 'Talk to a human',
    body: 'Questions about a house, a booking or a move? Reach us on WhatsApp and get an answer from the team.',
  },
  {
    icon: Zap,
    title: 'Everything in one place',
    body: 'Houses, movers and WiFi packages — lined up together so moving day does not turn into a scavenger hunt.',
  },
]

type HomeStats = { available: number; total: number; pending: number; taken: number }

type HomeRequest = {
  id: string
  location: string
  min_rent: number | null
  max_rent: number | null
  house_type_requested: string[] | null
  building_type: string[] | null
  description: string
  created_at: string
}

// Survive client-side navigation: returning to Home should paint the last
// batch and stats immediately while a fresh copy loads in the background.
const HOME_LISTINGS_TTL_MS = 45_000
const HOME_STATS_KEY = 'asehanta:home-stats:v1'
const homeListingsCache = new Map<string, { at: number; data: Listing[] }>()

function readStoredStats(): HomeStats | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(HOME_STATS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; data?: HomeStats }
    if (!parsed?.data || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > 10 * 60_000) return null
    return parsed.data
  } catch {
    return null
  }
}

function storeStats(data: HomeStats) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(HOME_STATS_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch {
    // Storage can be unavailable in private mode; in-memory state still works.
  }
}

export default function HomePage() {
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [isLister, setIsLister] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)
  const [stats, setStats] = useState<HomeStats>({ available: 0, total: 0, pending: 0, taken: 0 })
  const [houseRequests, setHouseRequests] = useState<HomeRequest[]>([])

  useEffect(() => {
    // Paint the previous counts immediately when coming back to Home, then
    // refresh them in the background.
    const remembered = readStoredStats()
    if (remembered) setStats(remembered)

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user ? { id: data.user.id } : null)
      if (data.user) {
        try {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
          setIsLister(profile?.role === 'lister' || profile?.role === 'admin')
        } catch {}
      }
    })
    // Fetch stats for all statuses using count endpoint (avoids 12-item page cap)
    const fetchStatusCount = async (status: string): Promise<number> => {
      try {
        const res = await fetch(`/api/listings?count=1&status=${status}`)
        if (!res.ok) return 0
        const data = await res.json()
        return typeof data?.count === 'number' ? data.count : 0
      } catch {
        return 0
      }
    }
    Promise.all([
      fetchStatusCount('published'),
      fetchStatusCount('taken'),
      fetchStatusCount('booked'),
    ]).then(([published, taken, booked]) => {
      const next = {
        available: published,
        total: published + taken + booked,
        pending: 0,
        taken: taken + booked,
      }
      setStats(next)
      storeStats(next)
    }).catch(() => {})

    // Open house requests are public and anonymised: show the newest few so
    // listers can see demand straight from the home page.
    supabase
      .from('house_requests_public')
      .select('id, location, min_rent, max_rent, house_type_requested, building_type, description, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (data) setHouseRequests(data as HomeRequest[])
      })
  }, [])

  const fetchListings = useCallback(
    async (page: number): Promise<Listing[]> => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '8')
      params.set('status', 'all')
      if (query) params.set('query', query)
      if (sort) params.set('sort', sort)
      if (filters.location) params.set('location', filters.location)
      if (filters.minRent) params.set('minRent', filters.minRent)
      if (filters.maxRent) params.set('maxRent', filters.maxRent)
      if (filters.minPrice) params.set('minPrice', filters.minPrice)
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice)
      if (filters.issues !== undefined && filters.issues !== '') {
        params.set('issues', filters.issues)
      }

      const cacheKey = params.toString()
      const hit = homeListingsCache.get(cacheKey)
      if (hit && Date.now() - hit.at < HOME_LISTINGS_TTL_MS) return hit.data

      const res = await fetch(`/api/listings?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        console.error(`[listings] API error: ${res.status} ${res.statusText}`)
        throw new Error(
          res.status === 429
            ? 'Too many requests right now. Please wait a moment and try again.'
            : 'Could not load homes. Check your connection and try again.'
        )
      }
      const data = await res.json()
      if (!Array.isArray(data)) {
        throw new Error(data?.error || 'Unexpected response while loading homes.')
      }
      homeListingsCache.set(cacheKey, { at: Date.now(), data: data as Listing[] })
      return data as Listing[]
    },
    [query, sort, filters]
  )

  const listAHouseLink = user ? '/upload' : '/auth/signup?role=lister'

  const countAvailable = useCountUp(stats.available)
  const countTotal = useCountUp(stats.total)
  const countPending = useCountUp(stats.pending)
  const countTaken = useCountUp(stats.taken)

  // The exact total is only meaningful when no search or filter narrows the list.
  const filtersActive = Boolean(
    query ||
      filters.location ||
      filters.minRent ||
      filters.maxRent ||
      filters.minPrice ||
      filters.maxPrice ||
      (filters.issues !== undefined && filters.issues !== '')
  )
  const homeTotal = filtersActive ? undefined : stats.total

  return (
    <div>
      {/* Hero */}
      <section className="mesh-hero relative overflow-hidden border-b border-gray-100 dark:border-slate-800">
        <div className="grid-lines absolute inset-0 opacity-80" aria-hidden="true" />
        <div className="hero-orb -left-24 top-10 h-64 w-64 bg-[#30B54A]/35" aria-hidden="true" />
        <div className="hero-orb -right-16 top-0 h-72 w-72 bg-blue-500/25" style={{ animationDelay: '1.5s' }} aria-hidden="true" />
        <div className="hero-orb bottom-0 left-1/3 h-52 w-52 bg-yellow-300/25" style={{ animationDelay: '2.5s' }} aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-12 sm:pt-16">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#30B54A]/25 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-[#2a9c40] shadow-sm backdrop-blur dark:border-[#30B54A]/30 dark:bg-slate-900/70 dark:text-[#6fdc84] animate-fadeInDown">
              <Sparkles className="h-3.5 w-3.5" />
              Verified homes across Kenya
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#30B54A] animate-pulse-slow" />
            </span>

            <h1 className="mt-5 text-[2.15rem] font-extrabold leading-[1.05] tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-[3.6rem] animate-fadeInUp">
              Find a home you&apos;ll love.
              <br />
              <span className="text-gradient">Move in without the stress.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
              Browse real homes with real prices, book a viewing safely, then get your movers and WiFi sorted in the
              same place. House hunting, minus the guesswork.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center animate-fadeInUp" style={{ animationDelay: '0.18s' }}>
              <a
                href="#homes"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#30B54A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#30B54A]/25 transition-all hover:-translate-y-0.5 hover:bg-[#2a9c40] hover:shadow-xl active:scale-95"
              >
                Explore homes
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <Link
                href="/request-house"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300/80 bg-white/80 px-6 py-3 text-sm font-semibold text-gray-800 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-[#30B54A]/50 hover:text-[#2a9c40] hover:shadow-md active:scale-95 dark:border-slate-700 dark:bg-slate-900/70 dark:text-gray-100 dark:hover:text-[#6fdc84]"
              >
                <Search className="h-4 w-4" /> Request a house
              </Link>
              <Link
                href={listAHouseLink}
                className="text-sm font-semibold text-blue-600 underline-offset-4 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400"
              >
                or list your house
              </Link>
              {isLister && (
                <Link
                  href="/requests"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#30B54A]/40 bg-[#e8f8eb]/80 px-5 py-2.5 text-sm font-semibold text-[#2a9c40] transition-all hover:-translate-y-0.5 hover:bg-[#e8f8eb] dark:bg-[#30B54A]/15 dark:text-[#6fdc84]"
                >
                  House requests
                </Link>
              )}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-gray-600 dark:text-gray-400 animate-fadeIn" style={{ animationDelay: '0.28s' }}>
              {TRUST_POINTS.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-[#30B54A]" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <div className="glass rounded-2xl p-4 text-center animate-fadeInUp" style={{ animationDelay: '0.15s' }}>
              <p className="text-2xl font-extrabold text-[#30B54A] sm:text-3xl">{countAvailable}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Available homes</p>
            </div>
            <div className="glass rounded-2xl p-4 text-center animate-fadeInUp" style={{ animationDelay: '0.22s' }}>
              <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 sm:text-3xl">{countTotal}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Homes listed</p>
            </div>
            <div className="glass rounded-2xl p-4 text-center animate-fadeInUp" style={{ animationDelay: '0.29s' }}>
              <p className="text-2xl font-extrabold text-amber-500 sm:text-3xl">{countPending}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Awaiting review</p>
            </div>
            <Link
              href="/taken"
              className="glass group rounded-2xl p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-fadeInUp"
              style={{ animationDelay: '0.36s' }}
            >
              <p className="text-2xl font-extrabold text-rose-500 sm:text-3xl">{countTaken}</p>
              <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Homes taken
                <ArrowRight className="h-3 w-3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* Search + listings */}
      <section id="homes" className="relative mx-auto max-w-7xl scroll-mt-20 px-4">
        <div className="glass relative z-10 -mt-7 rounded-2xl p-4 sm:p-5 animate-scaleIn">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <SearchBar onSearch={setQuery} onToggleFilters={() => setShowFilters(!showFilters)} />
            </div>
            <SortDropdown value={sort} onChange={setSort} />
          </div>
          {showFilters && (
            <div className="mt-4 animate-fadeIn">
              <FilterPanel onApply={setFilters} />
            </div>
          )}
        </div>

        <div className="pb-12 pt-9">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#2a9c40] dark:text-[#6fdc84]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30B54A] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#30B54A]" />
                </span>
                Live listings
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                Available &amp; booked homes
              </h2>
            </div>
            <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
              New homes are added regularly. Book a viewing before someone else does.
            </p>
          </div>

          <ListingGrid
            key={`${query}|${sort}|${JSON.stringify(filters)}`}
            fetchListings={fetchListings}
            sort={sort}
            filters={filters}
            query={query}
            pageSize={8}
            total={homeTotal}
            batchMode
          />
        </div>
      </section>

      {/* Open house requests */}
      {houseRequests.length > 0 && (
        <section className="border-y border-gray-100 bg-white py-14 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mx-auto max-w-7xl px-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  <HomeIcon className="h-3.5 w-3.5" /> People are looking
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                  Open house requests
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                  Renters and buyers have told us exactly what they need. If you have a matching house, claim the
                  request and list it.
                </p>
              </div>
              <Link
                href="/requests"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:bg-blue-700"
              >
                See all requests <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {houseRequests.map((request) => {
                const rent =
                  request.min_rent != null && request.max_rent != null
                    ? `${formatPrice(request.min_rent)} – ${formatPrice(request.max_rent)}`
                    : request.max_rent != null
                      ? `Up to ${formatPrice(request.max_rent)}`
                      : request.min_rent != null
                        ? `From ${formatPrice(request.min_rent)}`
                        : 'Budget open'
                const wanted = [
                  ...(request.house_type_requested || []),
                  ...(request.building_type || []),
                ].slice(0, 3)
                return (
                  <Link
                    key={request.id}
                    href="/requests"
                    className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-gray-50/70 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:bg-white hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-blue-800 dark:hover:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white">
                        <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        {request.location || 'Location open'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        <Clock className="h-3 w-3" /> Open
                      </span>
                    </div>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2a9c40] dark:text-[#6fdc84]">
                      <Banknote className="h-4 w-4" /> {rent}
                    </p>
                    {wanted.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {wanted.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                      {request.description}
                    </p>
                    <span className="mt-auto pt-3 text-xs font-semibold text-blue-600 group-hover:underline dark:text-blue-400">
                      View request →
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-y border-gray-100 bg-white py-16 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="mx-auto max-w-7xl px-4">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#2a9c40] dark:text-[#6fdc84]">Simple by design</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              From browsing to keys in three steps
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              We keep the process short and transparent, so you always know what happens next.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ icon: Icon, title, body }, index) => (
              <Reveal key={title} delay={index * 90}>
                <div className="card-sheen group relative h-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/70 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#30B54A]/40 hover:bg-white hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-[#30B54A]/40 dark:hover:bg-slate-900">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f8eb] text-[#2a9c40] transition-transform duration-300 group-hover:scale-110 dark:bg-[#30B54A]/15 dark:text-[#6fdc84]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-3xl font-black text-gray-200 dark:text-slate-800">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-base font-bold text-gray-900 dark:text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Why AseHanta */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#2a9c40] dark:text-[#6fdc84]">Why AseHanta</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                House hunting should feel exciting, not risky.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                We built AseHanta to remove the parts people dread: fake photos, surprise costs and sending money to a
                stranger. What is left is the good part — finding a place to call home.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Real photos & videos', 'Clear monthly costs', 'Escrow protection', 'Human support'].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#30B54A]" />
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link
                  href="/request-house"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:bg-blue-700"
                >
                  Tell us what you need <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/contact" className="text-sm font-semibold text-gray-700 underline-offset-4 hover:text-[#2a9c40] hover:underline dark:text-gray-300 dark:hover:text-[#6fdc84]">
                  Talk to the team
                </Link>
              </div>
            </Reveal>

            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body }, index) => (
                <Reveal key={title} delay={index * 70}>
                  <div className="h-full rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800">
                    <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="mt-3 text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="px-4 pb-16">
        <Reveal className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-10 sm:px-10 sm:py-12 dark:border dark:border-slate-800">
            <div className="hero-orb -right-10 -top-16 h-56 w-56 bg-[#30B54A]/30" aria-hidden="true" />
            <div className="hero-orb -bottom-20 left-10 h-56 w-56 bg-blue-500/25" style={{ animationDelay: '2s' }} aria-hidden="true" />
            <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="max-w-xl">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#6fdc84]">
                  <MapPin className="h-3.5 w-3.5" /> Kenya-wide
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Can&apos;t find the right house yet?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  Tell us your budget, preferred area and move-in date. Our agents will look for matching homes and
                  contact you on WhatsApp.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Link
                  href="/request-house"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#30B54A] px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#2a9c40]"
                >
                  Request a house <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={listAHouseLink}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/10"
                >
                  List your house
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
