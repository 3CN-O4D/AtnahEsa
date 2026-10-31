'use client'

import { useRef } from 'react'
import { useShake } from './useShake'

type OtpInputProps = {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  invalid?: boolean
  shakeSignal?: number
  autoFocus?: boolean
}

const EMPTY = ['', '', '', '', '', '']

export function emptyOtp() {
  return [...EMPTY]
}

/** Six animated digit boxes with auto-advance, paste support and shake errors. */
export default function OtpInput({
  value,
  onChange,
  disabled = false,
  invalid = false,
  shakeSignal = 0,
  autoFocus = true,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const shaking = useShake(shakeSignal)

  const setAt = (index: number, digit: string) => {
    const next = [...value]
    next[index] = digit
    onChange(next)
  }

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) {
      setAt(index, '')
      return
    }
    setAt(index, digit)
    if (index < 5) refs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (value[index]) {
        setAt(index, '')
      } else if (index > 0) {
        refs.current[index - 1]?.focus()
        setAt(index - 1, '')
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    e.preventDefault()
    const next = [...value]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    onChange(next)
    refs.current[Math.min(text.length, 5)]?.focus()
  }

  return (
    <div className={`flex justify-center gap-2 ${shaking ? 'animate-authShake' : ''}`} onPaste={handlePaste}>
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={invalid}
          className={`h-12 w-11 rounded-xl border text-center text-lg font-bold shadow-sm transition-all duration-200 focus:outline-none focus:ring-4 disabled:opacity-60 ${
            invalid
              ? 'border-red-400 bg-red-50/60 text-red-700 focus:border-red-500 focus:ring-red-500/20 dark:border-red-700 dark:bg-red-950/20 dark:text-red-300'
              : digit
                ? 'border-emerald-400 bg-emerald-50/60 text-emerald-700 ring-1 ring-emerald-400/20 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300'
                : 'border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-slate-800 dark:text-white'
          }`}
        />
      ))}
    </div>
  )
}
