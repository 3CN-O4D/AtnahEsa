'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Download, Film, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_VIDEOS = 5
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100 MB, enforced again server-side
const ACCEPTED_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogv']
const ACCEPT_ATTR = 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.m4v,.ogv'

interface VideoUploaderProps {
  videoUrls: string[]
  onChange: (urls: string[]) => void
  /** Lets the parent disable submit while bytes are still in flight. */
  onUploadingChange?: (uploading: boolean) => void
}

interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'queued' | 'uploading' | 'error'
  error?: string
}

interface PresignedUpload {
  uploadUrl: string
  publicUrl: string
  contentType: string
}

function extOf(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase()
}

function validateFile(file: File): string | null {
  const ext = extOf(file.name)
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `"${file.name}" is not a supported video. Use ${ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(', ')} (MP4 recommended).`
  }
  if (file.size === 0) return `"${file.name}" is empty.`
  if (file.size > MAX_VIDEO_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(0)
    return `"${file.name}" is ${mb}MB. Videos must be 100MB or smaller.`
  }
  return null
}

async function requestPresignedUpload(file: File): Promise<PresignedUpload> {
  const res = await fetch(
    `/api/upload-video/info?name=${encodeURIComponent(file.name)}&content-length=${file.size}`,
    { method: 'GET', cache: 'no-store' }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.uploadUrl !== 'string') {
    throw new Error(data.error || `Could not prepare the upload (${res.status}). Please retry.`)
  }
  return data as PresignedUpload
}

function putVideo(
  file: File,
  upload: PresignedUpload,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', upload.uploadUrl, true)
    xhr.timeout = 15 * 60 * 1000
    xhr.setRequestHeader('Content-Type', upload.contentType)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        let message = `Upload failed (${xhr.status}).`
        try {
          const body = JSON.parse(xhr.responseText)
          if (body?.message) message = `${message} ${body.message}`
        } catch {
          /* R2 returns XML on failure */
        }
        reject(new Error(message))
      }
    }

    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and retry.'))
    xhr.ontimeout = () => reject(new Error('The video upload timed out. Please retry.'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))

    xhr.send(file)
  })
}

export default function VideoUploader({ videoUrls, onChange, onUploadingChange }: VideoUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const urlsRef = useRef(videoUrls)

  useEffect(() => {
    urlsRef.current = videoUrls
  }, [videoUrls])

  const uploading = items.some((item) => item.status === 'uploading' || item.status === 'queued')

  useEffect(() => {
    onUploadingChange?.(uploading)
  }, [uploading, onUploadingChange])

  const appendUrl = useCallback((url: string) => {
    if (urlsRef.current.includes(url)) return
    const next = [...urlsRef.current, url]
    urlsRef.current = next
    onChange(next)
  }, [onChange])

  const runItem = useCallback(async (item: UploadItem) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', progress: 0, error: undefined } : i)))

    try {
      const upload = await requestPresignedUpload(item.file)
      await putVideo(item.file, upload, (percent) => {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, progress: percent } : i)))
      })
      appendUrl(upload.publicUrl)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video upload failed. Please retry.'
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: message } : i)))
      setError(message)
    }
  }, [appendUrl])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (inputRef.current) inputRef.current.value = ''
    if (!files.length) return

    setError('')

    const activeCount = items.filter((i) => i.status !== 'error').length
    const remaining = Math.max(0, MAX_VIDEOS - urlsRef.current.length - activeCount)
    if (remaining === 0) {
      setError(`You can add up to ${MAX_VIDEOS} videos per listing. Remove one first.`)
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
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        progress: 0,
        status: 'queued',
      })
    }

    const skipped = files.length - remaining
    if (skipped > 0) {
      problems.push(`${skipped} more video${skipped === 1 ? '' : 's'} skipped — the ${MAX_VIDEOS}-video limit would be exceeded.`)
    }

    if (problems.length) setError(problems.join(' '))
    if (!accepted.length) return

    setItems((prev) => [...prev, ...accepted])
    // Upload sequentially: video files are large, and one at a time keeps the
    // progress readable and avoids saturating the connection.
    for (const item of accepted) {
      await runItem(item)
    }
  }

  const retry = (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    setError('')
    const retried = { ...item, status: 'queued' as const, progress: 0, error: undefined }
    setItems((prev) => prev.map((i) => (i.id === id ? retried : i)))
    void runItem(retried)
  }

  const dismiss = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  const removeVideo = (index: number) => {
    const next = videoUrls.filter((_, i) => i !== index)
    urlsRef.current = next
    onChange(next)
  }

  const slotsLeft = Math.max(0, MAX_VIDEOS - videoUrls.length - items.filter((i) => i.status !== 'error').length)

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Video Tours <span className="text-xs text-gray-400">({videoUrls.length}/{MAX_VIDEOS})</span>
      </label>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1 leading-relaxed">{error}</p>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error" className="rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {(videoUrls.length > 0 || items.length > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {videoUrls.map((url, i) => (
            <div key={url} className="group relative aspect-video overflow-hidden rounded-lg bg-gray-900">
              <video src={url} preload="metadata" className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/0 opacity-0 transition-colors group-hover:bg-black/40 group-hover:opacity-100">
                <a href={url} target="_blank" rel="noopener noreferrer" download
                  className="rounded-full bg-white/80 p-1.5 text-gray-800 hover:bg-white"
                  title="Download">
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => removeVideo(i)}
                  className="rounded-full bg-red-500/80 p-1.5 text-white hover:bg-red-600"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {items.map((item) => (
            <div key={item.id} className="relative flex aspect-video flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-gray-900 p-2 text-white">
              <Film className="h-5 w-5 opacity-70" />
              <span className="w-full truncate text-center text-[10px] text-white/80">{item.file.name}</span>

              {item.status === 'error' ? (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => retry(item.id)} aria-label={`Retry ${item.file.name}`} className="rounded-full bg-white/90 p-1 text-gray-900 hover:bg-white">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => dismiss(item.id)} aria-label={`Remove ${item.file.name}`} className="rounded-full bg-white/90 p-1 text-gray-900 hover:bg-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-full space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-blue-400 transition-all duration-200"
                      style={{ width: `${item.status === 'queued' ? 2 : Math.max(2, item.progress)}%` }}
                    />
                  </div>
                  <p className="text-center text-[10px] font-medium">
                    {item.status === 'queued' ? 'Waiting…' : `${item.progress}%`}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {slotsLeft > 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-500',
            'transition-colors hover:border-blue-400 hover:text-blue-500 disabled:opacity-50',
            'dark:border-gray-600 dark:hover:border-blue-500'
          )}
        >
          {uploading ? (
            <>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="text-[10px]">Uploading video…</span>
            </>
          ) : (
            <>
              <Film className="h-5 w-5" />
              <span className="text-xs font-medium">{videoUrls.length === 0 ? 'Upload Videos' : 'Add More'}</span>
              <span className="text-[10px]">MP4, WebM, MOV · max 100MB each</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  )
}
