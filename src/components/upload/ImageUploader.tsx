'use client'

import { useState, useRef } from 'react'
import { Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageUploaderProps {
  images: string[]
  onChange: (images: string[]) => void
  maxImages?: number
}

export default function ImageUploader({ images, onChange, maxImages = 10 }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    setUploading(true)
    try {
      const remaining = maxImages - images.length
      const toUpload = Array.from(files).slice(0, remaining)

      const uploadedUrls = await Promise.all(
        toUpload.map(async (file) => {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/upload', { method: 'POST', body: formData })
          const data = await res.json()
          return data.url
        })
      )

      onChange([...images, ...uploadedUrls])
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {images.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
            <img src={url} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              aria-label={`Remove image ${i + 1}`}
              onClick={() => removeImage(i)}
              className="absolute top-1.5 right-1.5 p-1.5 bg-black/70 text-white rounded-full shadow-lg transition-colors hover:bg-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              'aspect-square rounded-lg border-2 border-dashed border-gray-300',
              'flex flex-col items-center justify-center gap-1 text-gray-500',
              'hover:border-blue-400 hover:text-blue-500 transition-colors',
              uploading && 'opacity-50'
            )}
          >
            {uploading ? (
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span className="text-xs">Upload</span>
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
      <p className="text-xs text-gray-500">
        {images.length}/{maxImages} images uploaded
      </p>
    </div>
  )
}