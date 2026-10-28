'use client'

import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef, useState, useRef, useEffect } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  ripple?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, ripple = true, children, disabled, ...props }, ref) => {
    const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([])
    const rippleId = useRef(0)

    const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(37,99,235,0.25)] relative overflow-hidden'

    const variants = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-0.5 hover:shadow-lg',
      secondary: 'bg-gray-800 dark:bg-gray-600 text-white hover:bg-gray-900 dark:hover:bg-gray-500 hover:-translate-y-0.5 hover:shadow-lg',
      outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 hover:-translate-y-0.5 hover:shadow-md',
      danger: 'bg-red-600 text-white hover:bg-red-700 hover:-translate-y-0.5 hover:shadow-lg',
      ghost: 'text-gray-700 hover:bg-gray-100 hover:-translate-y-0.5',
    }

    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
    }

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!ripple || disabled || loading) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const id = rippleId.current++
      setRipples((prev) => [...prev, { x, y, id }])
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id))
      }, 600)
    }

    useEffect(() => {
      if (loading) {
        const timer = setTimeout(() => {}, 100)
        return () => clearTimeout(timer)
      }
    }, [loading])

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        onClick={handleClick}
        {...props}
      >
        {ripple && ripples.map((r) => (
          <span
            key={r.id}
            className="absolute w-2 h-2 bg-white/40 rounded-full pointer-events-none animate-[ripple_600ms_ease-out]"
            style={{
              left: r.x,
              top: r.y,
              transform: 'translate(-50%, -50%) scale(0)',
              transformOrigin: 'center',
            }}
          />
        ))}
        {loading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
