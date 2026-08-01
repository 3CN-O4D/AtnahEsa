'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/ThemeProvider'

export default function ThemeToggle() {
  const { dark, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center gap-2 rounded-full border px-2 py-1.5 text-xs font-medium transition-colors duration-300 ${
        dark ? 'border-indigo-700 bg-indigo-950 text-indigo-100 hover:bg-indigo-900' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
      }`}
    >
      <span className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-300 ${dark ? 'bg-indigo-800' : 'bg-amber-300'}`}>
        <span
          className={`absolute flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform duration-300 ${
            dark ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        >
          <Sun
            className={`absolute h-3 w-3 text-amber-500 transition-all duration-300 ${
              dark ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
            }`}
          />
          <Moon
            className={`absolute h-3 w-3 text-indigo-600 transition-all duration-300 ${
              dark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
            }`}
          />
        </span>
      </span>
      <span className="select-none">{dark ? 'Dark' : 'Light'}</span>
    </button>
  )
}
