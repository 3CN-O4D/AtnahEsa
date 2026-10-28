'use client'

import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef, useState } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const [focused, setFocused] = useState(false)

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={id} className={cn(
            'block text-sm font-medium text-gray-700 transition-all duration-200',
            focused && 'text-blue-600 dark:text-blue-400'
          )}>
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            className={cn(
              'block w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm transition-all duration-200',
              'placeholder:text-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:ring-offset-0',
              'bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100',
              'hover:border-gray-400 dark:hover:border-gray-500',
              error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-600',
              focused && !error && 'ring-2 ring-blue-500/20 border-blue-500 shadow-[0_0_0_3px_rgba(37,99,235,0.1)]',
              className
            )}
            onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
            onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
            {...props}
          />
          {focused && !error && (
            <div className="absolute inset-0 rounded-lg border-2 border-blue-500/50 pointer-events-none animate-scaleIn" />
          )}
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400 animate-fadeInUp">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
