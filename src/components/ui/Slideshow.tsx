'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SlideshowProps {
  images: string[]
  interval?: number
  className?: string
  onImageClick?: (index: number) => void
}

export default function Slideshow({ images, interval = 5000, className, onImageClick }: SlideshowProps) {
  const [current, setCurrent] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [loaded, setLoaded] = useState<Record<string, boolean>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const [paused, setPaused] = useState(false)
  const touchX = useRef(0)
  const touchY = useRef(0)

  // A new set of images always starts from the first slide. Adjusting state
  // during render avoids an extra effect pass and a visible flash of the old
  // slide when a card reuses its slot for different media.
  const imagesKey = images.join('|')
  const [activeImagesKey, setActiveImagesKey] = useState(imagesKey)
  if (activeImagesKey !== imagesKey) {
    setActiveImagesKey(imagesKey)
    setCurrent(0)
  }

  const next = useCallback(() => {
    if (isAnimating || images.length === 0) return
    setIsAnimating(true)
    setCurrent((c) => (c + 1) % images.length)
    setTimeout(() => setIsAnimating(false), 400)
  }, [images.length, isAnimating])

  const prev = useCallback(() => {
    if (isAnimating || images.length === 0) return
    setIsAnimating(true)
    setCurrent((c) => (c - 1 + images.length) % images.length)
    setTimeout(() => setIsAnimating(false), 400)
  }, [images.length, isAnimating])

  useEffect(() => {
    if (images.length <= 1 || paused) return
    const timer = setInterval(next, interval)
    return () => clearInterval(timer)
  }, [next, interval, images.length, paused])

  // Warm the next slide so a swipe/auto-advance never shows an empty frame.
  useEffect(() => {
    if (images.length <= 1) return
    const nextUrl = images[(current + 1) % images.length]
    if (!nextUrl) return
    const img = new Image()
    img.src = nextUrl
  }, [current, images])

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
    setIsAnimating(true)
    setCurrent(i)
    setTimeout(() => setIsAnimating(false), 400)
  }

  if (!images.length) return null

  const src = images[current]
  const isLoaded = !!loaded[src]
  const hasFailed = !!failed[src]

  return (
    <div
      className={cn('relative group overflow-hidden rounded-xl bg-gray-100 dark:bg-slate-800 cursor-pointer select-none', className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => onImageClick?.(current)}
    >
      {/* Shimmer placeholder shown until the current frame is decoded */}
      {!isLoaded && !hasFailed && (
        <div className="absolute inset-0 animate-shimmer" aria-hidden="true" />
      )}

      {hasFailed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-400 dark:text-gray-500">
          <ImageOff className="h-6 w-6" />
          <span className="text-[10px] font-medium">Photo unavailable</span>
        </div>
      ) : (
        <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: isAnimating ? 0.5 : 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Slide ${current + 1} of ${images.length}`}
            loading={current === 0 ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() => setLoaded((prev) => (prev[src] ? prev : { ...prev, [src]: true }))}
            onError={() => setFailed((prev) => ({ ...prev, [src]: true }))}
            className={cn(
              'pointer-events-none h-full w-full object-cover transition-all duration-500 group-hover:scale-150',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
          />
        </div>
      )}

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
