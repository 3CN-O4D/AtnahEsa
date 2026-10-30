'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'

type ToggleResult = 'added' | 'removed' | 'auth' | 'error'

type FavoritesContextValue = {
  ids: Set<string>
  count: number
  ready: boolean
  signedIn: boolean
  isFavorite: (listingId: string) => boolean
  toggle: (listingId: string) => Promise<ToggleResult>
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

const GUEST_KEY = 'asehanta:favorites'

function readGuestIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(GUEST_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeGuestIds(values: Iterable<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify([...values]))
  } catch {
    // Storage can be full or blocked; favourites still work for this session.
  }
}

/**
 * Keeps saved houses in one place so every heart on the site stays in sync.
 *
 * Guests get a local list, and the moment they sign in that list is merged
 * into their account so favourites follow them across devices.
 */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const loadedFor = useRef<string | null>(null)

  const load = useCallback(async (userId: string) => {
    try {
      const res = await fetch('/api/favorites', { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not load favourites')
      const data = (await res.json()) as { ids?: string[] }
      if (loadedFor.current !== userId) return
      setIds(new Set(data.ids || []))
    } catch {
      if (loadedFor.current === userId) setIds(new Set())
    } finally {
      if (loadedFor.current === userId) setReady(true)
    }
  }, [])

  // Push anything saved as a guest into the account, then load the merged set.
  const mergeGuest = useCallback(
    async (userId: string) => {
      const guest = readGuestIds()
      if (guest.length > 0) {
        try {
          await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: guest }),
          })
        } catch {
          // Merge is best-effort; the account list still loads below.
        }
        writeGuestIds([])
      }
      if (loadedFor.current !== userId) return
      await load(userId)
    },
    [load]
  )

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const applyUser = (userId: string | null) => {
      if (cancelled) return
      loadedFor.current = userId
      if (userId) {
        setSignedIn(true)
        void mergeGuest(userId)
      } else {
        setSignedIn(false)
        setIds(new Set(readGuestIds()))
        setReady(true)
      }
    }

    supabase.auth.getUser().then(({ data }) => applyUser(data.user?.id ?? null))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user?.id ?? null)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [mergeGuest])

  const toggle = useCallback(
    async (listingId: string): Promise<ToggleResult> => {
      const wasFavorite = ids.has(listingId)
      const previous = ids

      // Optimistic: the heart should respond immediately.
      setIds((current) => {
        const next = new Set(current)
        if (wasFavorite) next.delete(listingId)
        else next.add(listingId)
        return next
      })

      // Signed-out: keep it locally and merge into the account on sign-in.
      if (!signedIn) {
        const next = new Set(previous)
        if (wasFavorite) next.delete(listingId)
        else next.add(listingId)
        writeGuestIds(next)
        return wasFavorite ? 'removed' : 'added'
      }

      try {
        const res = wasFavorite
          ? await fetch(`/api/favorites?listing_id=${encodeURIComponent(listingId)}`, {
              method: 'DELETE',
            })
          : await fetch('/api/favorites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ listing_id: listingId }),
            })

        if (!res.ok) throw new Error('Could not update favourites')
        return wasFavorite ? 'removed' : 'added'
      } catch {
        setIds(previous)
        return 'error'
      }
    },
    [ids, signedIn]
  )

  const value = useMemo<FavoritesContextValue>(
    () => ({
      ids,
      count: ids.size,
      ready,
      signedIn,
      isFavorite: (listingId: string) => ids.has(listingId),
      toggle,
    }),
    [ids, ready, signedIn, toggle]
  )

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider')
  return ctx
}
