'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowUpRight,
  Check,
  Copy,
  Home as HomeIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  X,
} from 'lucide-react'
import { APP_NAME, WHATSAPP_NUMBER } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { getWhatsAppLink } from '@/lib/whatsapp'
import { pathSearchHint, isListingLikePath } from '@/lib/link-recovery'

type HouseSuggestion = {
  id: string
  title: string
  location: string
  rent: number
  price: number
  house_type: string | null
}

type LocationSuggestion = { location: string; count: number }

type SuggestionsPayload = {
  houses?: HouseSuggestion[]
  locations?: LocationSuggestion[]
}

/**
 * The useful half of the 404: shows which link failed and searches live
 * listings so an edited or stale link can be recovered without starting over.
 * Text only — no photos — so a wrong turn stays cheap on bandwidth.
 */
export default function NotFoundRecovery() {
  const pathname = usePathname()
  const router = useRouter()
  const hint = useMemo(
    () => (isListingLikePath(pathname || '') ? pathSearchHint(pathname || '') : ''),
    [pathname]
  )

  const [query, setQuery] = useState(hint)
  const [houses, setHouses] = useState<HouseSuggestion[]>([])
  const [locations, setLocations] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [searched, setSearched] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const requestIdRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++requestIdRef.current

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setFailed(false)
      try {
        const term = query.trim()
        const res = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(term)}`,
          { signal: controller.signal }
        )
        if (!res.ok) throw new Error('Search is unavailable')
        const data = (await res.json()) as SuggestionsPayload
        if (requestId !== requestIdRef.current) return
        setHouses(data.houses || [])
        setLocations(data.locations || [])
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return
        if (requestId === requestIdRef.current) {
          setHouses([])
          setLocations([])
          setFailed(true)
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setSearched(true)
        }
      }
    }, 240)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, refreshKey])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pathname || '/')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access is blocked in some browsers; the link is still visible.
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (query.trim() && houses[0]) {
      router.push(`/listings/${houses[0].id}`)
      return
    }
    // Re-run the search for the current text even if it has not changed.
    setRefreshKey((key) => key + 1)
    inputRef.current?.blur()
  }

  const chooseLocation = (location: string) => {
    setQuery(location)
    inputRef.current?.focus()
  }

  const supportHref =
    getWhatsAppLink(
      WHATSAPP_NUMBER,
      `Hi ${APP_NAME}, I followed a broken link: ${pathname || '(unknown path)'}`
    ) || `https://wa.me/${WHATSAPP_NUMBER}`

  const showEmpty = searched && !loading && !failed && houses.length === 0 && locations.length === 0

  return (
    <div className="mt-7 space-y-4">
      {/* The link that failed, with a copy action for support. */}
      <div className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/60">
        <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:bg-slate-800 dark:text-gray-400">
          404
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600 dark:text-gray-300">
          {pathname || '/'}
        </code>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-100"
          aria-label="Copy broken link"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#1D4ED8]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-3 shadow-xl shadow-slate-900/[0.04] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-black/30 sm:p-4">
        <form onSubmit={submit} className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a location, house type or title"
              aria-label="Search homes"
              autoComplete="off"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 dark:border-slate-700 dark:bg-slate-950/60 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {loading ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#1D4ED8]" />
            ) : query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#1D4ED8]/20 transition-colors hover:bg-[#1D4ED8]"
          >
            Search
          </button>
        </form>

        <div className="mt-3" aria-live="polite">
          {houses.length > 0 && (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 dark:divide-slate-800 dark:border-slate-800">
              {houses.slice(0, 5).map((house) => (
                <li key={house.id}>
                  <Link
                    href={`/listings/${house.id}`}
                    className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8] dark:bg-[#1D4ED8]/15 dark:text-[#93C5FD]">
                      <HomeIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {house.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {house.location}
                        {house.house_type ? <span className="text-gray-300 dark:text-gray-600">•</span> : null}
                        {house.house_type}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold text-gray-900 dark:text-white">
                        {formatPrice(house.rent || house.price)}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {house.rent ? '/ month' : 'booking fee'}
                      </span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#1D4ED8] dark:text-gray-600" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {showEmpty && (
            <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-gray-400">
              <p className="font-medium text-gray-700 dark:text-gray-200">No homes matched that search.</p>
              <p className="mt-1 text-xs">
                Check the spelling, try a nearby area, or{' '}
                <a
                  href={supportHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#1D4ED8] hover:underline dark:text-[#93C5FD]"
                >
                  ask us to find it
                </a>
                .
              </p>
            </div>
          )}

          {failed && (
            <p className="px-1 py-2 text-xs text-amber-600 dark:text-amber-400">
              Search is temporarily unavailable. You can still browse all homes below.
            </p>
          )}

          {locations.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Locations
              </span>
              {locations.map((location) => (
                <button
                  key={location.location}
                  type="button"
                  onClick={() => chooseLocation(location.location)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-[#1D4ED8]/40 hover:bg-[#1D4ED8]/5 hover:text-[#1E40AF] dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-[#1D4ED8]/40 dark:hover:text-[#93C5FD]"
                >
                  {location.location}
                  <span className="ml-1 text-gray-400 dark:text-gray-500">{location.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <a
        href={supportHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-[#1D4ED8] dark:text-gray-400 dark:hover:text-[#93C5FD]"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Report this broken link on WhatsApp
      </a>
    </div>
  )
}
