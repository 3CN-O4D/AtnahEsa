'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface ThemeContextType {
  dark: boolean
  /** False until the stored / system theme has been resolved on the client. */
  mounted: boolean
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextType>({ dark: false, mounted: false, toggle: () => {} })

const STORAGE_KEY = 'asehanta-theme'

/**
 * Theme resolution rules:
 *
 * 1. On first paint an inline script in the root layout applies the stored
 *    theme, falling back to the OS `prefers-color-scheme` — so there is no
 *    light/dark flash before React hydrates.
 * 2. Here on the client we re-resolve the same way and keep the class in
 *    sync.
 * 3. As long as the user has not made an explicit choice we keep following
 *    the OS live, so switching the device between dark and light blends the
 *    site in automatically.
 * 4. The choice is only written to localStorage when the user taps the
 *    toggle — never as a side effect of first load.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  /** null = resolving, true = user chose, false = following the OS. */
  const [explicit, setExplicit] = useState<boolean | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setDark(stored ? stored === 'dark' : prefersDark)
    setExplicit(stored !== null)
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // While following the OS, keep reacting to live system theme changes.
  useEffect(() => {
    if (!mounted || explicit !== false) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mounted, explicit])

  useEffect(() => {
    if (!mounted) return
    document.documentElement.classList.toggle('dark', dark)
  }, [dark, mounted])

  const toggle = () => {
    setExplicit(true)
    setDark((d) => {
      localStorage.setItem(STORAGE_KEY, d ? 'light' : 'dark')
      return !d
    })
  }

  return (
    <ThemeContext.Provider value={{ dark, mounted, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
