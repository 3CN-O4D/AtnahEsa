'use client'

import { useState } from 'react'
import { X, Flag } from 'lucide-react'
import Button from '@/components/ui/Button'

interface ReportModalProps {
  targetType: 'listing' | 'mover' | 'user'
  targetId: string
  targetTitle?: string
  onClose: () => void
}

const REPORT_REASONS = [
  'Fake or misleading',
  'Scam',
  'Wrong information',
  'Duplicate listing',
  'Already taken/not available',
  'Inappropriate content',
  'Harassment',
  'Other',
]

export default function ReportModal({ targetType, targetId, targetTitle, onClose }: ReportModalProps) {
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason) { setError('Please select a reason'); return }
    if (!description || description.trim().split(/\s+/).filter(Boolean).length < 4) {
      setError('Please provide at least 4 words describing the issue')
      return
    }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, target_title: targetTitle, reason, description }),
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
            <div className="flex items-center gap-2 mb-4">
              <Flag className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-bold">Report {targetType}</h2>
            </div>
            {targetTitle && <p className="text-sm text-gray-500 mb-4">&quot;{targetTitle}&quot;</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                  <option value="">Select a reason...</option>
                  {REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Description <span className="text-red-500">*</span></label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what's wrong (at least 4 words)..."
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" rows={4} required />
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
