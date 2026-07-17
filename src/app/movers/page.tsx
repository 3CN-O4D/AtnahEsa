'use client'

import { useState, useEffect } from 'react'
import { Phone, MapPin, DollarSign, Star, Flag, MessageCircle, X } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ReportModal from '@/components/reports/ReportModal'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { Mover, MoverReview } from '@/types'

function Stars({ rating, interactive, onChange, size }: { rating: number; interactive?: boolean; onChange?: (r: number) => void; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type={interactive ? 'button' : undefined}
          onClick={() => interactive && onChange?.(star)}
          className={`${size || 'text-sm'} ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}>
          ★
        </button>
      ))}
    </div>
  )
}

function ReviewsModal({ mover, onClose }: { mover: Mover; onClose: () => void }) {
  const [reviews, setReviews] = useState<MoverReview[]>([])
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id } : null))
    supabase.from('mover_reviews').select('*').eq('mover_id', mover.id).order('created_at', { ascending: false }).then(({ data }) => setReviews((data ?? []) as MoverReview[]))
  }, [mover.id])

  const handleSubmit = async () => {
    if (!user || myRating === 0) return
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from('mover_reviews').insert({ mover_id: mover.id, user_id: user.id, rating: myRating, comment: myComment })
    const { data } = await supabase.from('mover_reviews').select('*').eq('mover_id', mover.id).order('created_at', { ascending: false })
    setReviews((data ?? []) as MoverReview[])
    setMyRating(0); setMyComment('')
    setSubmitting(false)
  }

  const alreadyReviewed = user && reviews.some((r) => r.user_id === user.id)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-lg rounded-2xl p-6 max-h-[80vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold mb-1">{mover.name}</h2>
        <Stars rating={mover.average_rating || 0} size="text-lg" />
        <p className="text-sm text-gray-500 mb-4">{mover.total_reviews || 0} review{(mover.total_reviews || 0) !== 1 ? 's' : ''}</p>

        {user && !alreadyReviewed && (
          <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium">Rate this mover</p>
            <Stars rating={myRating} interactive onChange={setMyRating} size="text-xl" />
            <textarea value={myComment} onChange={(e) => setMyComment(e.target.value)} placeholder="Share your experience..." className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
            <Button size="sm" onClick={handleSubmit} loading={submitting} disabled={myRating === 0}>Submit</Button>
          </div>
        )}

        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No reviews yet.</p>}
          {reviews.map((r, i) => (
            <div key={r.id || i} className="border-b border-gray-100 pb-3 last:border-0">
              <div className="flex items-center gap-2">
                <Stars rating={r.rating} size="text-sm" />
                <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.comment && <p className="text-sm text-gray-600 mt-1">{r.comment}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MoversPage() {
  const [movers, setMovers] = useState<Mover[]>([])
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)
  const [reviewTarget, setReviewTarget] = useState<Mover | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('movers').select('*').order('created_at', { ascending: false }).then(({ data }) => setMovers((data ?? []) as Mover[]))
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Household Movers</h1>
        <p className="text-gray-600">Find reliable movers to help you transport your belongings.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8 text-sm text-amber-800">
        <p className="font-semibold mb-1">We haven't partnered with a moving company yet.</p>
        <p>However, we can arrange for a localized mover — a rider or a truck — to help transport your belongings. Contact us and we'll connect you.</p>
      </div>

      {movers.length === 0 && <div className="text-center py-12"><p className="text-gray-500">No movers listed yet.</p></div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {movers.map((mover) => (
          <Card key={mover.id}>
            {mover.image && <img src={mover.image} alt={mover.name} className="w-full h-40 object-cover" />}
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-lg">{mover.name}</h3>
                <button onClick={() => setReportTarget({ id: mover.id, name: mover.name })} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="Report this mover">
                  <Flag className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Stars rating={mover.average_rating || 0} size="text-sm" />
                <button onClick={() => setReviewTarget(mover)} className="text-xs text-blue-600 hover:underline">
                  {mover.total_reviews || 0} review{(mover.total_reviews || 0) !== 1 ? 's' : ''}
                </button>
              </div>
              <p className="text-sm text-gray-600 line-clamp-2">{mover.description}</p>
              <div className="space-y-1.5 text-sm text-gray-500">
                <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {mover.location}</div>
                <div className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> {formatPrice(mover.price)}</div>
              </div>
              <div className="flex gap-2">
                <a href={`tel:${mover.phone}`} className="flex-1"><Button size="sm" className="w-full"><Phone className="w-4 h-4 mr-1.5" /> Call</Button></a>
                <button onClick={() => setReviewTarget(mover)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  <MessageCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {reportTarget && (
        <ReportModal targetType="mover" targetId={reportTarget.id} targetTitle={reportTarget.name} onClose={() => setReportTarget(null)} />
      )}

      {reviewTarget && (
        <ReviewsModal mover={reviewTarget} onClose={() => setReviewTarget(null)} />
      )}
    </div>
  )
}
