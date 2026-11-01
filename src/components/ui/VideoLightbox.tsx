'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, ExternalLink, MoveDiagonal2 } from 'lucide-react'
import { resolveVideoSrc } from '@/lib/utils'

export type VideoItem = {
  type: 'direct' | 'youtube' | 'tiktok'
  url: string
  id: string
}

interface VideoLightboxProps {
  videos: VideoItem[]
  initialIndex: number
  onClose: () => void
}

const MIN_WIDTH = 260

function aspectFor(type: VideoItem['type']): number {
  // width / height
  return type === 'tiktok' ? 9 / 16 : 16 / 9
}

function labelFor(type: VideoItem['type']): string {
  return type === 'tiktok' ? 'TikTok tour' : type === 'youtube' ? 'YouTube tour' : 'Video tour'
}

/**
 * Full-screen video player for listing tours.
 *
 * The player opens large (near viewport height) and can be resized by dragging
 * the bottom-right corner, nudged with the preset buttons, or pushed to real
 * fullscreen. This works for direct uploads, YouTube (including Shorts) and
 * TikTok embeds.
 */
export default function VideoLightbox({ videos, initialIndex, onClose }: VideoLightboxProps) {
  const [current, setCurrent] = useState(initialIndex)
  const [width, setWidth] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const video = videos[current]
  const aspect = aspectFor(video.type)

  const maxWidth = useCallback(() => {
    if (typeof window === 'undefined') return 1200
    return Math.max(
      MIN_WIDTH,
      Math.min(window.innerWidth * 0.96, window.innerHeight * 0.9 * aspect)
    )
  }, [aspect])

  const clamp = useCallback((value: number) => Math.min(Math.max(value, MIN_WIDTH), maxWidth()), [maxWidth])

  const goNext = useCallback(() => setCurrent((c) => (c + 1) % videos.length), [videos.length])
  const goPrev = useCallback(() => setCurrent((c) => (c - 1 + videos.length) % videos.length), [videos.length])

  // Size the player to the viewport on mount, on video change and on rotation.
  useEffect(() => {
    const compute = () => setWidth((w) => (w ? clamp(w) : Math.min(1000, maxWidth())))
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [clamp, maxWidth])

  // Keyboard: close with Escape, move between clips with the arrow keys.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else onClose()
      }
      if (e.key === 'ArrowRight' && videos.length > 1) goNext()
      if (e.key === 'ArrowLeft' && videos.length > 1) goPrev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goNext, goPrev, videos.length])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Drag-to-resize. Pointer events over an embed do not bubble to this document,
  // so while dragging we lay a transparent shield over the whole screen.
  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, startWidth: width || maxWidth() }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return
      setWidth(clamp(dragRef.current.startWidth + (e.clientX - dragRef.current.startX)))
    }
    const end = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [dragging, clamp])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void boxRef.current?.requestFullscreen?.().catch(() => {})
    }
  }

  const presets = [
    { key: 'compact', label: 'Compact', value: Math.min(520, maxWidth()) },
    { key: 'large', label: 'Large', value: Math.min(900, maxWidth()) },
    { key: 'max', label: 'Max', value: maxWidth() },
  ]

  const height = Math.round((width || 0) / aspect)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm" onClick={onClose}>
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-white/90">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            video.type === 'tiktok' ? 'bg-white/15' : video.type === 'youtube' ? 'bg-red-600/80' : 'bg-blue-600/80'
          }`}>
            {video.type === 'tiktok' ? '♪' : video.type === 'youtube' ? '▶' : '●'} {labelFor(video.type)}
          </span>
          {videos.length > 1 && <span className="text-xs text-white/60">{current + 1} of {videos.length}</span>}
        </div>

        <div className="flex items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setWidth(clamp(p.value))}
              className={`hidden rounded-lg px-2.5 py-1.5 text-xs font-medium transition sm:inline-flex ${
                Math.abs(width - clamp(p.value)) < 8 ? 'bg-white text-gray-900' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close video"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Player */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-4" onClick={(e) => e.stopPropagation()}>
        {videos.length > 1 && (
          <button
            type="button"
            onClick={goPrev}
            className="mr-2 hidden shrink-0 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/25 sm:block"
            aria-label="Previous video"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <div className="group relative">
          <div
            ref={boxRef}
            className="relative overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/15"
            style={{ width: width || undefined, height: width ? height : undefined, maxWidth: '96vw', maxHeight: '90vh' }}
          >
            {video.type === 'direct' ? (
              <video
                key={video.url}
                controls
                autoPlay
                preload="metadata"
                playsInline
                className="h-full w-full object-contain"
              >
                <source src={resolveVideoSrc(video.url)} />
              </video>
            ) : video.type === 'tiktok' ? (
              <iframe
                key={video.id}
                src={`https://www.tiktok.com/embed/v2/${video.id}?lang=en&autoplay=1`}
                title={`TikTok video ${current + 1}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="h-full w-full"
              />
            ) : (
              <iframe
                key={video.id}
                src={`https://www.youtube.com/embed/${video.id}?rel=0&autoplay=1`}
                title={`YouTube video ${current + 1}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className="h-full w-full"
              />
            )}

            {/* Resize handle */}
            <button
              type="button"
              onPointerDown={onResizeStart}
              aria-label="Drag to resize the player"
              title="Drag to resize"
              className="absolute bottom-0 right-0 z-20 flex h-8 w-8 cursor-se-resize items-center justify-center rounded-tl-lg bg-black/60 text-white/80 opacity-70 backdrop-blur transition hover:bg-black/80 hover:opacity-100 group-hover:opacity-100"
            >
              <MoveDiagonal2 className="h-4 w-4 -scale-x-100" />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 px-1 text-xs text-white/60">
            <span className="hidden sm:inline">Drag the corner to resize · or tap a size above</span>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-white/70 transition hover:text-white"
            >
              Open {video.type === 'tiktok' ? 'in TikTok' : video.type === 'youtube' ? 'on YouTube' : 'video'}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {videos.length > 1 && (
          <button
            type="button"
            onClick={goNext}
            className="ml-2 hidden shrink-0 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/25 sm:block"
            aria-label="Next video"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Transparent shield so pointer moves keep reaching us while dragging over an embed */}
      {dragging && <div className="fixed inset-0 z-[60] cursor-se-resize" />}
    </div>
  )
}
