'use client'

import { useState } from 'react'
import { X, Flag } from 'lucide-react'
import Button from '@/components/ui/Button'

const REPORT_REASONS = [
  { id: 'inaccurate', label: "It's inaccurate or incorrect" },
  { id: 'not_real', label: "It's not a real place to stay" },
  { id: 'scam', label: "It's a scam" },
  { id: 'offensive', label: "It's offensive" },
  { id: 'other', label: "It's something else" },
]

interface ReportModalProps {
  targetType: 'listing' | 'mover' | 'user'
  targetId: string
  targetTitle?: string
  onClose: () => void
  showHeader?: boolean
}

export default function ReportModal({ targetType, targetId, targetTitle, onClose, showHeader = true }: ReportModalProps) {
  const [reasons, setReasons] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const toggleReason = (id: string) => {
    setReasons((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (reasons.length === 0) { setError('Please select at least one reason'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          target_title: targetTitle,
          reasons,
          description,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
      setDone(true)
    } catch { setError('Something went wrong') } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-md rounded-2xl p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>

        {done ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Flag className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-lg font-bold mb-2">Report Submitted</h2>
            <p className="text-sm text-gray-500">Thank you for helping keep AseHanta safe. Our team will review this within 24 hours.</p>
          </div>
        ) : (
          <>
            {showHeader && (
              <div className="mb-4">
                <h2 className="text-lg font-bold">Why are you reporting this listing?</h2>
                <p className="text-sm text-gray-500 mt-0.5">This won&apos;t be shared with the Host.</p>
              </div>
            )}
            {!showHeader && (
              <div className="flex items-center gap-2 mb-4">
                <Flag className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-bold">Report {targetType}</h2>
              </div>
            )}
            {targetTitle && <p className="text-sm text-gray-500 mb-4">&quot;{targetTitle}&quot;</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                {REPORT_REASONS.map((r) => (
                  <label key={r.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors has-[:checked]:border-red-400 has-[:checked]:bg-red-50">
                    <input type="checkbox" checked={reasons.includes(r.id)} onChange={() => toggleReason(r.id)}
                      className="mt-0.5 w-4 h-4 accent-red-500 rounded" />
                    <span className="text-sm text-gray-800">{r.label}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-1">
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us more about what happened (optional)..."
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" rows={3} />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" loading={loading} className="w-full bg-red-600 hover:bg-red-700">Submit Report</Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
