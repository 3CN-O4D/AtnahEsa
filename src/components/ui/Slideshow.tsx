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
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const touchX = useRef(0)
  const touchY = useRef(0)

  const next = useCallback(() => {
    if (isAnimating) return
    setDirection('next')
    setIsAnimating(true)
    setCurrent((c) => (c + 1) % images.length)
    setTimeout(() => { setIsAnimating(false); setDirection(null) }, 400)
  }, [images.length, isAnimating])

  const prev = useCallback(() => {
    if (isAnimating) return
    setDirection('prev')
    setIsAnimating(true)
    setCurrent((c) => (c - 1 + images.length) % images.length)
    setTimeout(() => { setIsAnimating(false); setDirection(null) }, 400)
  }, [images.length, isAnimating])

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
    if (isAnimating) return
    const dx = e.changedTouches[0].clientX - touchX.current
    const dy = e.changedTouches[0].clientY - touchY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) prev()
      else next()
    }
  }

  const goToSlide = (i: number) => {
    if (isAnimating || i === current) return
    setDirection(i > current ? 'next' : 'prev')
    setIsAnimating(true)
    setCurrent(i)
    setTimeout(() => { setIsAnimating(false); setDirection(null) }, 400)
  }

  if (!images.length) return null

  return (
    <div
      className={cn('relative group overflow-hidden rounded-xl bg-gray-100 cursor-pointer select-none', className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => onImageClick?.(current)}
    >
      <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: isAnimating ? 0.5 : 1 }}>
        <img
          src={images[current]}
          alt={`Slide ${current + 1}`}
          className="w-full h-full object-cover transition-all duration-500 group-hover:scale-150 pointer-events-none"
        />
      </div>
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white rounded-full transition-all duration-200 hover:bg-black/70 hover:scale-110 opacity-100 tap-scale"
            disabled={isAnimating}
            aria-label="Previous image"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white rounded-full transition-all duration-200 hover:bg-black/70 hover:scale-110 opacity-100 tap-scale"
            disabled={isAnimating}
            aria-label="Next image"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); goToSlide(i) }}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-300 tap-scale',
                  i === current ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/75'
                )}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === current ? 'true' : 'false'}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
