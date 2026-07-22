'use client'

import { useState, useRef } from 'react'
import { Upload, X, Video, Download, Film } from 'lucide-react'

interface VideoUploaderProps {
  videoUrls: string[]
  onChange: (urls: string[]) => void
}

const MAX_VIDEOS = 5

export default function VideoUploader({ videoUrls, onChange }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    const remaining = MAX_VIDEOS - videoUrls.length
    const toUpload = Array.from(files).slice(0, remaining)

    setError('')
    setUploading(true)

    try {
      const results: string[] = []
      for (const file of toUpload) {
        const presignRes = await fetch(`/api/upload-video/presign?name=${encodeURIComponent(file.name)}`)
        const data = await presignRes.json()
        if (!presignRes.ok || data.error) throw new Error(data.error || 'Failed to get upload URL')

        const uploadRes = await fetch(data.url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': data.contentType },
        })
        if (!uploadRes.ok) throw new Error('Upload failed')

        if (data.publicUrl) results.push(data.publicUrl)
      }

      onChange([...videoUrls, ...results])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeVideo = (index: number) => {
    onChange(videoUrls.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Video Tours <span className="text-xs text-gray-400">({videoUrls.length}/{MAX_VIDEOS})</span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {videoUrls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {videoUrls.map((url, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 aspect-video group">
              <video src={url} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                <a href={url} target="_blank" rel="noopener noreferrer" download
                  className="p-1.5 bg-white/80 text-gray-800 rounded-full hover:bg-white"
                  title="Download">
                  <Download className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => removeVideo(i)}
                  className="p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-600"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {videoUrls.length < MAX_VIDEOS && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          ) : (
            <>
              <Film className="w-5 h-5" />
              <span className="text-xs font-medium">{videoUrls.length === 0 ? 'Upload Videos' : 'Add More'}</span>
              <span className="text-[10px]">MP4, WebM, MOV (max {MAX_VIDEOS} videos)</span>
            </>
          )}
        </button>
      )}
      <input ref={inputRef} type="file" accept="video/*" multiple onChange={handleUpload} className="hidden" />
    </div>
  )
}