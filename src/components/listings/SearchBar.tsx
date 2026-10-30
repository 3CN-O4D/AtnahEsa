'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, SlidersHorizontal, X, MapPin, Home, ArrowRight, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatPrice } from '@/lib/utils'

interface SearchBarProps {
  onSearch: (query: string) => void
  onToggleFilters: () => void
}

type HouseSuggestion = {
  id: string
  title: string
  location: string
  rent: number
  price: number
  house_type: string | null
  image: string | null
}

type LocationSuggestion = { location: string; count: number }

type SuggestionOption =
  | { kind: 'house'; house: HouseSuggestion }
  | { kind: 'location'; location: LocationSuggestion }

export default function SearchBar({ onSearch, onToggleFilters }: SearchBarProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [houses, setHouses] = useState<HouseSuggestion[]>([])
  const [locations, setLocations] = useState<LocationSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const fetchSuggestions = useCallback(async (value: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current

    setLoading(true)
    try {
      const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(value)}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as {
        houses?: HouseSuggestion[]
        locations?: LocationSuggestion[]
      }
      if (requestId !== requestIdRef.current) return
      setHouses(data.houses || [])
      setLocations(data.locations || [])
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      if (requestId === requestIdRef.current) {
        setHouses([])
        setLocations([])
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  // Debounce typing so a fast typist does not hammer the suggestions endpoint.
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      void fetchSuggestions(query.trim())
    }, 220)
    return () => window.clearTimeout(timer)
  }, [query, open, fetchSuggestions])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const options: SuggestionOption[] = [
    ...houses.map((house) => ({ kind: 'house' as const, house })),
    ...locations.map((location) => ({ kind: 'location' as const, location })),
  ]

  const choose = (option: SuggestionOption) => {
    setOpen(false)
    setActiveIndex(-1)
    if (option.kind === 'house') {
      router.push(`/listings/${option.house.id}`)
      return
    }
    setQuery(option.location.location)
    onSearch(option.location.location)
    inputRef.current?.blur()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (open && activeIndex >= 0 && options[activeIndex]) {
      choose(options[activeIndex])
      return
    }
    onSearch(query)
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (options.length === 0) return
      setActiveIndex((current) => {
        if (e.key === 'ArrowDown') return (current + 1) % options.length
        return current <= 0 ? options.length - 1 : current - 1
      })
      return
    }
    if (e.key === 'Enter' && open && activeIndex >= 0 && options[activeIndex]) {
      e.preventDefault()
      choose(options[activeIndex])
    }
  }

  const clearQuery = () => {
    setQuery('')
    onSearch('')
    setActiveIndex(-1)
    void fetchSuggestions('')
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div ref={containerRef} className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors duration-200" />
        {loading && (
          <Loader2 className="absolute right-10 top-1/2 z-10 h-4 w-4 -translate-y-1/2 animate-spin text-[#30B54A]" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Try “Kisumu”, “2-bedroom” or a house name…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="search-suggestions"
          className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-10 text-sm text-gray-900 transition-all duration-200 hover:border-gray-400 focus:border-[#30B54A] focus:outline-none focus:ring-2 focus:ring-[#30B54A]/30 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100"
        />
        {query && (
          <button
            type="button"
            onClick={clearQuery}
            className="tap-scale absolute right-3 top-1/2 z-10 -translate-y-1/2 p-1 text-gray-400 transition-colors duration-200 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {open && (
          <div
            id="search-suggestions"
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl shadow-slate-900/15 animate-slideDown dark:border-slate-700 dark:bg-slate-900"
          >
            {houses.length > 0 && (
              <div className="p-2">
                <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Houses
                </p>
                {houses.map((house, index) => {
                  const optionIndex = index
                  const active = activeIndex === optionIndex
                  return (
                    <button
                      key={house.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(optionIndex)}
                      onClick={() => choose({ kind: 'house', house })}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${
                        active ? 'bg-[#e8f8eb] dark:bg-[#30B54A]/15' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-slate-800">
                        {house.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={house.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Home className="h-4 w-4 text-gray-400" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{house.title}</span>
                        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
                          <MapPin className="h-3 w-3 shrink-0" /> {house.location}
                          {house.house_type ? ` · ${house.house_type}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs font-bold text-gray-900 dark:text-white">{formatPrice(house.rent)}</span>
                        <span className="text-[10px] text-gray-400">/month</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {locations.length > 0 && (
              <div className={`p-2 ${houses.length > 0 ? 'border-t border-gray-100 dark:border-slate-800' : ''}`}>
                <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Locations
                </p>
                {locations.map((location, index) => {
                  const optionIndex = houses.length + index
                  const active = activeIndex === optionIndex
                  return (
                    <button
                      key={location.location}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(optionIndex)}
                      onClick={() => choose({ kind: 'location', location })}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                        active ? 'bg-[#e8f8eb] dark:bg-[#30B54A]/15' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <MapPin className="h-4 w-4 text-[#30B54A]" />
                      <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-200">{location.location}</span>
                      <span className="text-[11px] text-gray-400">{location.count} home{location.count !== 1 ? 's' : ''}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
                    </button>
                  )
                })}
              </div>
            )}

            {!loading && houses.length === 0 && locations.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  No matches for “{query}”
                </p>
                <p className="mt-1 text-xs text-gray-400">Try a county, estate, house type or rent range.</p>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400 dark:border-slate-800">
              <span className="hidden sm:inline">↑ ↓ to move · Enter to choose</span>
              <button
                type="submit"
                className="font-semibold text-[#2a9c40] transition-colors hover:text-[#1f7a30] dark:text-[#6fdc84]"
              >
                Search all houses →
              </button>
            </div>
          </div>
        )}
      </div>
      <Button type="submit" size="sm" className="tap-scale">
        Search
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onToggleFilters} className="tap-scale">
        <SlidersHorizontal className="w-4 h-4 transition-transform duration-200 hover:rotate-45" />
      </Button>
    </form>
  )
}
