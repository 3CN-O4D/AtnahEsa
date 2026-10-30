'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ImageOff, RefreshCw, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB, enforced again server-side
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const ACCEPT_ATTR = ACCEPTED_TYPES.join(',')
const MAX_CONCURRENT_UPLOADS = 3

interface ImageUploaderProps {
  images: string[]
  onChange: (images: string[]) => void
  maxImages?: number
  /** Lets the parent disable submit while bytes are still in flight. */
  onUploadingChange?: (uploading: boolean) => void
}

interface UploadItem {
  id: string
  file: File
  preview: string
  progress: number
  status: 'queued' | 'uploading' | 'error'
  error?: string
}

function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    case 'avif': return 'image/avif'
    case 'heic':
    case 'heif': return 'image/heic'
    default: return ''
  }
}

function validateFile(file: File): string | null {
  const type = file.type || guessType(file.name)
  if (!ACCEPTED_TYPES.includes(type)) {
    if (type === 'image/heic' || type === 'image/heif') {
      return `"${file.name}" is a HEIC/HEIF photo. Please use JPG, PNG, WebP or AVIF (on iPhone: Settings → Camera → Formats → Most Compatible).`
    }
    return `"${file.name}" is not a supported image format. Use JPG, PNG, WebP or AVIF.`
  }
  if (file.size === 0) return `"${file.name}" is empty.`
  if (file.size > MAX_IMAGE_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return `"${file.name}" is ${mb}MB. Images must be 10MB or smaller.`
  }
  return null
}

interface PresignedUpload {
  uploadUrl: string
  publicUrl: string
  contentType: string
}

async function requestPresignedUpload(file: File, index: number): Promise<PresignedUpload> {
  const res = await fetch(
    `/api/upload/info?name=${encodeURIComponent(file.name)}&content-length=${file.size}&index=${index}`,
    { method: 'GET', cache: 'no-store' }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.uploadUrl !== 'string' || typeof data.publicUrl !== 'string') {
    throw new Error(data.error || `Could not prepare the upload (${res.status}). Please retry.`)
  }
  return data as PresignedUpload
}

/**
 * Browsers PUT the bytes straight to R2. Proxying photos through the app would
 * hit Vercel's 4.5MB request-body cap, which phone photos routinely exceed.
 */
function putImage(
  file: File,
  upload: PresignedUpload,
  onProgress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', upload.uploadUrl, true)
    xhr.timeout = 120_000
    xhr.setRequestHeader('Content-Type', upload.contentType)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(upload.publicUrl)
        return
      }
      let detail = ''
      const match = /<Message>([^<]+)<\/Message>/i.exec(xhr.responseText)
      if (match) detail = ` ${match[1]}`
      reject(new Error(`Upload failed (${xhr.status}).${detail} Please retry.`))
    }

    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and retry.'))
    xhr.ontimeout = () => reject(new Error('The upload timed out. Please retry.'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))

    xhr.send(file)
  })
}

async function uploadImage(
  file: File,
  index: number,
  onProgress: (percent: number) => void
): Promise<string> {
  const upload = await requestPresignedUpload(file, index)
  return putImage(file, upload, onProgress)
}

export default function ImageUploader({
  images,
  onChange,
  maxImages = 10,
  onUploadingChange,
}: ImageUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [error, setError] = useState('')
  const [broken, setBroken] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const counterRef = useRef(0)
  const imagesRef = useRef(images)
  const previewsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  const uploading = items.some((item) => item.status === 'uploading' || item.status === 'queued')

  useEffect(() => {
    onUploadingChange?.(uploading)
  }, [uploading, onUploadingChange])

  // Release object URLs when the component goes away.
  useEffect(() => {
    const previews = previewsRef.current
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url))
      previews.clear()
    }
  }, [])

  const appendUrl = useCallback((url: string) => {
    if (imagesRef.current.includes(url)) return
    const next = [...imagesRef.current, url]
    imagesRef.current = next
    onChange(next)
  }, [onChange])

  const runItem = useCallback(async (item: UploadItem) => {
    const index = counterRef.current++
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', progress: 0, error: undefined } : i)))

    try {
      const url = await uploadImage(item.file, index, (percent) => {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, progress: percent } : i)))
      })
      appendUrl(url)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      URL.revokeObjectURL(item.preview)
      previewsRef.current.delete(item.preview)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please retry.'
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: message } : i)))
      setError(message)
    }
  }, [appendUrl])

  const runQueue = useCallback(async (batch: UploadItem[]) => {
    let cursor = 0
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, batch.length) }, async () => {
      while (cursor < batch.length) {
        const item = batch[cursor++]
        await runItem(item)
      }
    })
    await Promise.all(workers)
  }, [runItem])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (inputRef.current) inputRef.current.value = ''
    if (!files.length) return

    setError('')

    const activeCount = items.filter((i) => i.status !== 'error').length
    const remaining = Math.max(0, maxImages - imagesRef.current.length - activeCount)
    if (remaining === 0) {
      setError(`You can upload up to ${maxImages} photos per listing. Remove one first.`)
      return
    }

    const accepted: UploadItem[] = []
    const problems: string[] = []

    for (const file of files.slice(0, remaining)) {
      const problem = validateFile(file)
      if (problem) {
        problems.push(problem)
        continue
      }
      const preview = URL.createObjectURL(file)
      previewsRef.current.add(preview)
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview,
        progress: 0,
        status: 'queued',
      })
    }

    const skipped = files.length - remaining
    if (skipped > 0 && accepted.length + problems.length > 0) {
      problems.push(`${skipped} more photo${skipped === 1 ? '' : 's'} skipped — the ${maxImages}-photo limit would be exceeded.`)
    }

    if (problems.length) setError(problems.join(' '))
    if (!accepted.length) return

    setItems((prev) => [...prev, ...accepted])
    await runQueue(accepted)
  }

  const retry = (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    setError('')
    const retried = { ...item, status: 'queued' as const, progress: 0, error: undefined }
    setItems((prev) => prev.map((i) => (i.id === id ? retried : i)))
    void runItem(retried)
  }

  const dismiss = (id: string) => {
    const item = items.find((i) => i.id === id)
    if (item) {
      URL.revokeObjectURL(item.preview)
      previewsRef.current.delete(item.preview)
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const removeImage = (index: number) => {
    const next = images.filter((_, i) => i !== index)
    imagesRef.current = next
    onChange(next)
  }

  const slotsLeft = Math.max(0, maxImages - images.length - items.filter((i) => i.status !== 'error').length)
  const doneCount = images.length
  const activeCount = items.filter((i) => i.status === 'uploading').length

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1 leading-relaxed">{error}</p>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error" className="rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((url, i) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-slate-800">
            {broken.has(url) ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-400">
                <ImageOff className="h-6 w-6" />
                <span className="px-1 text-center text-[10px] leading-tight">Image unavailable</span>
              </div>
            ) : (
              <img
                src={url}
                alt={`Listing photo ${i + 1}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                onError={() => setBroken((prev) => new Set(prev).add(url))}
              />
            )}
            <button
              type="button"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => removeImage(i)}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1.5 text-white shadow-lg transition-colors hover:bg-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {items.map((item) => (
          <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.preview} alt={item.file.name} className="h-full w-full object-cover opacity-60" />

            {item.status === 'error' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-red-950/70 p-2 text-center text-white">
                <AlertCircle className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight">Failed</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => retry(item.id)} aria-label={`Retry ${item.file.name}`} className="rounded-full bg-white/90 p-1 text-gray-900 hover:bg-white">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => dismiss(item.id)} aria-label={`Remove ${item.file.name}`} className="rounded-full bg-white/90 p-1 text-gray-900 hover:bg-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
                <div className="relative h-9 w-9">
                  <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/25" />
                    <circle
                      cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${(item.progress / 100) * 94.2} 94.2`}
                      className="text-white transition-all duration-200"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
                    {item.status === 'queued' ? '…' : `${item.progress}%`}
                  </span>
                </div>
                <span className="text-[10px] font-medium">{item.status === 'queued' ? 'Waiting' : 'Uploading'}</span>
              </div>
            )}
          </div>
        ))}

        {slotsLeft > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading && slotsLeft === 0}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-500',
              'transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-gray-600 dark:hover:border-blue-500',
              uploading && 'opacity-60'
            )}
          >
            {uploading ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <span className="text-[10px]">{activeCount} uploading</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span className="text-xs">Add photos</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        onChange={handleUpload}
        className="hidden"
      />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {doneCount}/{maxImages} photos
          {uploading && <span className="ml-1 text-blue-600 dark:text-blue-400">· uploading…</span>}
        </span>
        <span>JPG, PNG, WebP or AVIF · max 10MB each</span>
      </div>
    </div>
  )
}
