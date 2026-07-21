'use client'

import { useState, useRef } from 'react'
import { Upload, X, Video, Download } from 'lucide-react'

interface VideoUploaderProps {
  videoUrl: string
  onChange: (url: string) => void
}

export default function VideoUploader({ videoUrl, onChange }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)

    try {
      const presignRes = await fetch(`/api/upload-video/presign?name=${encodeURIComponent(file.name)}`)
      const data = await presignRes.json()
      if (!presignRes.ok || data.error) throw new Error(data.error || 'Failed to get upload URL')

      const uploadRes = await fetch(data.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': data.contentType },
      })
      if (!uploadRes.ok) throw new Error('Upload failed')

      if (data.publicUrl) onChange(data.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Video Tour</label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {videoUrl ? (
        <div className="relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
          <video src={videoUrl} controls className="w-full max-h-48 rounded-lg" />
          <div className="absolute top-2 right-2 flex gap-1">
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" download
              className="p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80"
              title="Download video to upload to YouTube">
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={() => onChange('')}
              className="p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
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
