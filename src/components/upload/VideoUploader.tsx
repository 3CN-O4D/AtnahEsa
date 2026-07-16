'use client'

import { useState, useRef } from 'react'
import { Upload, X, Video } from 'lucide-react'

interface VideoUploaderProps {
  videoUrl: string
  onChange: (url: string) => void
}

export default function VideoUploader({ videoUrl, onChange }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload-video', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) onChange(data.url)
    } catch {
      console.error('Video upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Video Tour</label>
      {videoUrl ? (
        <div className="relative rounded-lg overflow-hidden bg-gray-100">
          <video src={videoUrl} controls className="w-full max-h-48 rounded-lg" />
          <button
            onClick={() => onChange('')}
            className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-32 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          ) : (
            <>
              <Video className="w-8 h-8" />
              <span className="text-sm font-medium">Upload Video</span>
              <span className="text-xs">MP4, WebM, MOV (max 50MB)</span>
            </>
          )}
        </button>
      )}
      <input ref={inputRef} type="file" accept="video/*" onChange={handleUpload} className="hidden" />
    </div>
  )
}
