'use client'

import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect, useCallback, ReactNode, useState } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[90vw]',
}

export default function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (open) {
      setIsMounted(true)
      setIsClosing(false)
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    } else if (isMounted) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsMounted(false)
        document.body.style.overflow = 'unset'
      }, 200)
      return () => clearTimeout(timer)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [open, handleKeyDown, isMounted])

  if (!isMounted && !open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          'fixed inset-0 bg-black/50 transition-opacity duration-200',
          isClosing && 'opacity-0'
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full mx-4 max-h-[90vh] overflow-y-auto z-10 transition-all duration-200 ease-spring',
          sizes[size],
          className,
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100',
          !isClosing && open && 'animate-scaleIn'
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 animate-fadeInDown">
            <h2 className="text-lg font-semibold dark:text-gray-100">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 tap-scale"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 dark:text-gray-400 transition-transform duration-200 hover:rotate-90" />
            </button>
          </div>
        )}
        <div className="p-4 animate-fadeInUp">{children}</div>
      </div>
    </div>
  )
}
