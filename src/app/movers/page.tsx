'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Phone,
  MapPin,
  Wallet,
  Star,
  Flag,
  MessageCircle,
  X,
  Truck,
  Search,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  PackageCheck,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import ReportModal from '@/components/reports/ReportModal'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { WHATSAPP_NUMBER, CONTACT_PHONE } from '@/lib/constants'
import type { Mover, MoverReview } from '@/types'

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent']
const AVATAR_TINTS = [
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-blue-600',
  'from-indigo-500 to-violet-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function tintFor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % AVATAR_TINTS.length
  return AVATAR_TINTS[hash]
}

function Stars({
  rating,
  interactive,
  onChange,
  size = 'text-sm',
  animate = false,
}: {
  rating: number
  interactive?: boolean
  onChange?: (r: number) => void
  size?: string
  animate?: boolean
}) {
  const [hovered, setHovered] = useState(0)
  const shown = interactive && hovered > 0 ? hovered : rating

  if (!interactive) {
    return (
      <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`} role="img">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            aria-hidden
            className={`${size} leading-none ${star <= shown ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
          >
            ★
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={rating === star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange?.(star)}
          className={`${size} cursor-pointer leading-none transition-transform duration-150 hover:scale-125 active:scale-90 ${
            star <= shown ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'
          } ${animate && star <= rating ? 'animate-starPop' : ''}`}
          style={animate ? { animationDelay: `${(star - 1) * 40}ms` } : undefined}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function ReviewsModal({ mover, onClose }: { mover: Mover; onClose: () => void }) {
  const [reviews, setReviews] = useState<MoverReview[]>([])
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState('')
  const [myAnonymous, setMyAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id } : null))
    supabase
      .from('mover_reviews')
      .select('*')
      .eq('mover_id', mover.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setReviews((data ?? []) as MoverReview[])
        setLoading(false)
      })
  }, [mover.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const handleSubmit = async () => {
    if (!user || myRating === 0) return
    setSubmitting(true)
    setError('')
    const supabase = createClient()
    const { error: insertError } = await supabase
      .from('mover_reviews')
      .insert({ mover_id: mover.id, user_id: user.id, rating: myRating, comment: myComment.trim(), is_anonymous: myAnonymous })
    if (insertError) {
      setError('Could not post your review. Please try again.')
      setSubmitting(false)
      return
    }
    const { data } = await supabase
      .from('mover_reviews')
      .select('*')
      .eq('mover_id', mover.id)
      .order('created_at', { ascending: false })
    setReviews((data ?? []) as MoverReview[])
    setMyRating(0)
    setMyComment('')
    setMyAnonymous(false)
    setSubmitting(false)
  }

  const alreadyReviewed = Boolean(user && reviews.some((r) => r.user_id === user.id))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Reviews for ${mover.name}`}
    >
      <div className="relative max-h-[88vh] w-full max-w-lg animate-slideUp overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6 dark:bg-slate-900">
        <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden dark:bg-gray-700" />
        <button
          onClick={onClose}
          aria-label="Close reviews"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 pr-10">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tintFor(mover.id)} text-sm font-bold text-white shadow-sm`}>
            {initials(mover.name)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-900 dark:text-white">{mover.name}</h2>
            <div className="mt-0.5 flex items-center gap-2">
              <Stars rating={mover.average_rating || 0} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {mover.average_rating ? mover.average_rating.toFixed(1) : 'New'} · {mover.total_reviews || 0} review{(mover.total_reviews || 0) === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        {user && !alreadyReviewed && (
          <div className="mt-5 space-y-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-slate-800/60">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Rate this mover
            </p>
            <div className="flex items-center gap-2">
              <Stars rating={myRating} interactive onChange={setMyRating} size="text-2xl" animate={myRating > 0} />
              {myRating > 0 && (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{RATING_LABELS[myRating - 1]}</span>
              )}
            </div>
            <div className="relative">
              <textarea
                value={myComment}
                onChange={(e) => setMyComment(e.target.value.slice(0, 400))}
                placeholder="How did the move go? Punctual, careful with your things?"
                className="block w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 dark:border-gray-600 dark:bg-slate-900 dark:text-gray-100"
                rows={3}
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] tabular-nums text-gray-400">{myComment.length}/400</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={myAnonymous}
                  onChange={(e) => setMyAnonymous(e.target.checked)}
                  className="h-4 w-4 rounded accent-gray-600"
                />
                Post anonymously
              </label>
              <Button size="sm" onClick={handleSubmit} loading={submitting} disabled={myRating === 0}>
                Post review
              </Button>
            </div>
            {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}

        {!user && (
          <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            Sign in to leave a review. Everyone can read them.
          </p>
        )}

        <div className="mt-5 space-y-3">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                  <div className="h-3 w-24 animate-shimmer rounded" />
                  <div className="h-3 w-full animate-shimmer rounded" />
                </div>
              ))}
            </div>
          )}

          {!loading && reviews.length === 0 && (
            <div className="py-8 text-center">
              <Star className="mx-auto mb-2 h-8 w-8 animate-pulse-slow text-gray-200 dark:text-gray-700" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No reviews yet</p>
              <p className="mt-0.5 text-xs text-gray-400">Be the first to share your experience.</p>
            </div>
          )}

          {reviews.map((r, i) => (
            <div
              key={r.id || i}
              className="animate-fadeInUp rounded-xl border border-gray-100 p-3.5 dark:border-gray-800"
              style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Stars rating={r.rating} size="text-sm" />
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    {r.is_anonymous ? 'Anonymous hunter' : 'Verified user'}
                  </span>
                </div>
                <span className="text-[11px] text-gray-400">
                  {new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {r.comment && (
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">&ldquo;{r.comment}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type SortMode = 'recommended' | 'price' | 'rating'

export default function MoversPage() {
  const [movers, setMovers] = useState<Mover[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('recommended')
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)
  const [reviewTarget, setReviewTarget] = useState<Mover | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('movers')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setMovers((data ?? []) as Mover[])
        setLoading(false)
      })
  }, [])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    const filtered = term
      ? movers.filter((m) =>
          [m.name, m.location, m.description].some((field) => field?.toLowerCase().includes(term))
        )
      : movers

    const sorted = [...filtered]
    if (sort === 'price') sorted.sort((a, b) => (a.price || 0) - (b.price || 0))
    if (sort === 'rating') sorted.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0))
    return sorted
  }, [movers, query, sort])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl animate-float" />
          <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl animate-float [animation-delay:2.5s]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 py-14 md:py-20">
          <div className="max-w-2xl">
            <span className="inline-flex animate-fadeInDown items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-blue-100 backdrop-blur">
              <Truck className="h-3.5 w-3.5" /> Moving day, handled
            </span>
            <h1 className="mt-4 animate-fadeInUp text-3xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              Move without the
              <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent"> heavy lifting.</span>
            </h1>
            <p className="mt-4 max-w-xl animate-fadeInUp text-sm leading-relaxed text-blue-100/80 [animation-delay:120ms] md:text-base">
              Find vetted riders and trucks for your belongings. Compare ratings, call directly, and agree on a fair price before the move.
            </p>

            <div className="mt-7 flex animate-fadeInUp flex-wrap items-center gap-3 [animation-delay:200ms]">
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-scale inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition-all hover:-translate-y-0.5 hover:bg-emerald-400"
              >
                <MessageCircle className="h-4 w-4" /> Ask us to arrange one
              </a>
              <a
                href={`tel:${CONTACT_PHONE}`}
                className="tap-scale inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/10"
              >
                <Phone className="h-4 w-4" /> Call {CONTACT_PHONE}
              </a>
            </div>

            <dl className="mt-8 grid max-w-lg animate-fadeInUp grid-cols-3 gap-3 [animation-delay:280ms]">
              {[
                { Icon: ShieldCheck, label: 'Rated by movers' },
                { Icon: PackageCheck, label: 'Bikes & trucks' },
                { Icon: Wallet, label: 'Agree upfront' },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
                  <Icon className="h-4 w-4 shrink-0 text-emerald-300" />
                  <dt className="text-[11px] font-medium text-blue-100/80">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Notice */}
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-sm text-amber-900 shadow-sm dark:border-amber-800/60 dark:from-amber-950/40 dark:to-orange-950/30 dark:text-amber-100">
          <div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-300/30 blur-2xl" />
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-4 w-4 text-amber-500" /> We&apos;re growing our mover network
          </p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/80">
            We haven&apos;t partnered with a large moving company yet. We can still arrange a localized mover — a rider or a truck — for your belongings.
            Contact us and we&apos;ll connect you.
          </p>
        </div>

        {/* Controls */}
        {(loading || movers.length > 0) && (
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white md:text-2xl">Available movers</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {loading ? 'Loading…' : `${movers.length} mover${movers.length === 1 ? '' : 's'} listed`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or area"
                  aria-label="Search movers"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 sm:w-56 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-100"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                aria-label="Sort movers"
                className="rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200"
              >
                <option value="recommended">Newest</option>
                <option value="rating">Top rated</option>
                <option value="price">Lowest price</option>
              </select>
            </div>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-slate-900" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="h-36 animate-shimmer" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-2/3 animate-shimmer rounded" />
                  <div className="h-3 w-1/3 animate-shimmer rounded" />
                  <div className="h-3 w-full animate-shimmer rounded" />
                  <div className="h-9 w-full animate-shimmer rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && visible.length === 0 && (
          <div className="animate-scaleIn rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-gray-700 dark:bg-slate-900">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40">
              {movers.length === 0 ? <Truck className="h-7 w-7 text-blue-500" /> : <Search className="h-7 w-7 text-blue-500" />}
            </div>
            <p className="font-semibold text-gray-800 dark:text-gray-100">
              {movers.length === 0 ? 'No movers listed yet' : 'No movers match that search'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
              {movers.length === 0
                ? 'Tell us what you need moved and we will connect you with someone reliable in your area.'
                : 'Try a different name or area, or clear the search to see everyone.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {movers.length > 0 && (
                <button
                  onClick={() => { setQuery(''); setSort('recommended') }}
                  className="tap-scale inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-slate-800"
                >
                  Clear search
                </button>
              )}
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-scale inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <MessageCircle className="h-4 w-4" /> Request a mover <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Grid */}
        {!loading && visible.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((mover, index) => {
              const rating = mover.average_rating || 0
              return (
                <article
                  key={mover.id}
                  className="group flex animate-fadeInUp flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-gray-300 hover:shadow-xl dark:border-gray-800 dark:bg-slate-900 dark:hover:border-gray-600"
                  style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
                >
                  <div className="relative h-40 shrink-0 overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-700">
                    {mover.image ? (
                      <img
                        src={mover.image}
                        alt={mover.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${tintFor(mover.id)}`}>
                        <span className="text-3xl font-bold text-white/90">{initials(mover.name)}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
                    <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                      <MapPin className="h-3 w-3" /> {mover.location || 'Location on request'}
                    </span>
                    <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-bold text-gray-800 shadow-sm backdrop-blur">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {rating > 0 ? rating.toFixed(1) : 'New'}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-white">{mover.name}</h3>
                        <button
                          onClick={() => setReviewTarget(mover)}
                          className="mt-1 flex items-center gap-1.5 text-xs text-blue-600 transition-colors hover:underline dark:text-blue-400"
                        >
                          <Stars rating={rating} size="text-xs" />
                          {mover.total_reviews || 0} review{(mover.total_reviews || 0) === 1 ? '' : 's'}
                        </button>
                      </div>
                      <button
                        onClick={() => setReportTarget({ id: mover.id, name: mover.name })}
                        className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        title="Report this mover"
                        aria-label={`Report ${mover.name}`}
                      >
                        <Flag className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                      {mover.description || 'General household moving and transport.'}
                    </p>

                    <div className="mt-auto space-y-2">
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Wallet className="h-3.5 w-3.5" />
                        {formatPrice(mover.price)}
                        <span className="text-[11px] font-normal text-emerald-600/70 dark:text-emerald-400/70">est.</span>
                      </div>

                      <div className="flex gap-2">
                        <a href={`tel:${mover.phone}`} className="flex-1">
                          <Button size="sm" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500">
                            <Phone className="mr-1.5 h-4 w-4" /> Call
                          </Button>
                        </a>
                        <button
                          onClick={() => setReviewTarget(mover)}
                          className="tap-scale inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 text-gray-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-600 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                          aria-label={`Read and write reviews for ${mover.name}`}
                          title="Reviews"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* Bottom CTA */}
        {!loading && movers.length > 0 && (
          <div className="mt-10 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-6 text-center dark:border-blue-900/50 dark:from-blue-950/30 dark:via-slate-900 dark:to-emerald-950/20">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Don&apos;t see someone for your route?</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
              Send us your pickup and drop-off area. We&apos;ll ask around and get back to you with a fair quote.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-scale inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-105"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp us
              </a>
              <a
                href={`tel:${CONTACT_PHONE}`}
                className="tap-scale inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
              >
                <Phone className="h-4 w-4" /> Call
              </a>
            </div>
          </div>
        )}
      </div>

      {reportTarget && (
        <ReportModal targetType="mover" targetId={reportTarget.id} targetTitle={reportTarget.name} onClose={() => setReportTarget(null)} />
      )}

      {reviewTarget && <ReviewsModal mover={reviewTarget} onClose={() => setReviewTarget(null)} />}
    </div>
  )
}
