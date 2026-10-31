'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Eye, EyeOff, X } from 'lucide-react'
import { useShake } from './useShake'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minLength?: number
  showStrength?: boolean
  error?: string
  invalid?: boolean
  shakeSignal?: number
  autoComplete?: string
  required?: boolean
  disabled?: boolean
}

/**
 * Password input that shows its state while you type: red until the minimum
 * length is met, green once it is, with a shake when a submit fails.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder = 'Enter your password',
  minLength = 6,
  showStrength = false,
  error,
  invalid = false,
  shakeSignal = 0,
  autoComplete = 'current-password',
  required = true,
  disabled = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const [focused, setFocused] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const shaking = useShake(shakeSignal)

  const typed = value.length > 0
  const valid = value.length >= minLength
  const isInvalid = invalid || Boolean(error) || (typed && !valid)
  const progress = Math.min(100, Math.round((value.length / minLength) * 100))

  const borderClass = isInvalid
    ? 'border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-500/25 dark:border-red-700 dark:bg-red-950/20'
    : valid
      ? 'border-emerald-400 bg-emerald-50/40 focus:border-emerald-500 focus:ring-emerald-500/25 dark:border-emerald-700 dark:bg-emerald-950/20'
      : 'border-gray-300 bg-white focus:border-blue-500 focus:ring-blue-500/25 dark:border-gray-600 dark:bg-slate-800'

  return (
    <div className={`space-y-1.5 ${shaking ? 'animate-authShake' : ''}`}>
      <label
        htmlFor={id}
        className={`block text-sm font-medium transition-colors ${
          isInvalid ? 'text-red-600 dark:text-red-400' : valid ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-200'
        }`}
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setCapsLock(false) }}
          onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          aria-invalid={isInvalid}
          className={`block w-full rounded-xl border px-3.5 py-2.5 pr-11 text-sm shadow-sm transition-all duration-200 focus:outline-none focus:ring-4 disabled:opacity-60 ${borderClass}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 active:scale-90 dark:hover:bg-slate-700 dark:hover:text-gray-200"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {showStrength && (
        <div className="pt-0.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                valid ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-red-400 to-rose-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                valid ? 'text-emerald-600 dark:text-emerald-400' : typed ? 'text-red-600 dark:text-red-400' : 'text-gray-400'
              }`}
            >
              {valid ? <Check className="h-3 w-3" /> : typed ? <X className="h-3 w-3" /> : null}
              {valid ? 'Password looks good' : typed ? `${minLength - value.length} more character${minLength - value.length === 1 ? '' : 's'}` : `At least ${minLength} characters`}
            </span>
            <span className="tabular-nums text-gray-400">{Math.min(value.length, minLength)}/{minLength}</span>
          </div>
        </div>
      )}

      {capsLock && focused && (
        <p className="inline-flex animate-fadeIn items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" /> Caps Lock is on
        </p>
      )}

      {error && <p className="animate-fadeInUp text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
