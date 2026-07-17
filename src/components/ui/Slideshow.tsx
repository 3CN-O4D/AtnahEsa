'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SlideshowProps {
  images: string[]
  interval?: number
  className?: string
  onImageClick?: (index: number) => void
}

export default function Slideshow({ images, interval = 5000, className, onImageClick }: SlideshowProps) {
  const [current, setCurrent] = useState(0)
  const touchX = useRef(0)
  const touchY = useRef(0)

  const next = useCallback(() => setCurrent((c) => (c + 1) % images.length), [images.length])
  const prev = useCallback(() => setCurrent((c) => (c - 1 + images.length) % images.length), [images.length])

  useEffect(() => {
    if (images.length <= 1) return
    const timer = setInterval(next, interval)
    return () => clearInterval(timer)
  }, [next, interval, images.length])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX
    touchY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX.current
    const dy = e.changedTouches[0].clientY - touchY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) prev()
      else next()
    }
  }

  if (!images.length) return null

  return (
    <div
      className={cn('relative group overflow-hidden rounded-xl bg-gray-100 cursor-pointer select-none', className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => onImageClick?.(current)}
    >
      <img
        src={images[current]}
        alt={`Slide ${current + 1}`}
        className="w-full h-full object-cover transition-opacity duration-500 pointer-events-none"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white rounded-full transition-opacity hover:bg-black/70 opacity-100"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white rounded-full transition-opacity hover:bg-black/70 opacity-100"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrent(i) }}
                className={cn(
                  'w-2 h-2 rounded-full transition-colors',
                  i === current ? 'bg-white' : 'bg-white/50'
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
