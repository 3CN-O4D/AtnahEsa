'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import ImageUploader from '@/components/upload/ImageUploader'
import VideoUploader from '@/components/upload/VideoUploader'
import { createClient } from '@/lib/supabase/client'
import { MIN_BOOKING_FEE } from '@/lib/constants'
import type { Listing } from '@/types'

export default function AdminEditListingPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [electricity, setElectricity] = useState('')
  const [water, setWater] = useState('')
  const [whyVacant, setWhyVacant] = useState('')
  const [descriptiveLocation, setDescriptiveLocation] = useState('')
  const [location, setLocation] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [newIssue, setNewIssue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [originalImages, setOriginalImages] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/'); return }

      const { data } = await supabase.from('listings').select('*').eq('id', id).single()
      if (!data) { router.push('/admin'); return }

      const l = data as Listing
      setListing(l)
      setTitle(l.title)
      setDescription(l.description)
      setPrice(String(l.price))
      setRent(String(l.rent))
      setDeposit(String(l.deposit))
      setElectricity(l.electricity)
      setWater(l.water)
      setWhyVacant(l.why_vacant)
      setDescriptiveLocation(l.descriptive_location)
      setLocation(l.location)
      setYoutubeUrl(l.youtube_url ?? '')
      setVideoUrl(l.video_url ?? '')
      setIssues(l.issues)
      setPaymentMethod(l.payment_method)
      setImages(l.images)
      setOriginalImages(l.images)
      setLoading(false)
    })
  }, [id, router])

  const addIssue = () => {
    if (newIssue.trim()) {
      setIssues([...issues, newIssue.trim()])
      setNewIssue('')
    }
  }

  const removeIssue = (index: number) => {
    setIssues(issues.filter((_, i) => i !== index))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const fee = parseInt(price)
    if (fee < MIN_BOOKING_FEE) { setError(`Minimum booking fee is ${MIN_BOOKING_FEE}`); return }

    setSaving(true)

    try {
      const supabase = createClient()

      // Delete removed images from Cloudinary
      const removed = originalImages.filter((url) => !images.includes(url))
      await Promise.allSettled(
        removed.map((url) =>
          fetch('/api/delete-image', { method: 'POST', body: JSON.stringify({ url }) })
        )
      )

      const { error: updateErr } = await supabase.from('listings').update({
        title,
        description,
        price: fee,
        rent: parseInt(rent) || 0,
        deposit: parseInt(deposit) || 0,
        electricity,
        water,
        why_vacant: whyVacant,
        descriptive_location: descriptiveLocation,
        location,
        images,
        youtube_url: youtubeUrl || null,
        video_url: videoUrl || null,
        issues,
        issues_count: issues.length,
        payment_method: paymentMethod,
      }).eq('id', id)

      if (updateErr) { setError(updateErr.message); return }
      setSuccess('Listing updated!')
      setOriginalImages(images)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-600 hover:text-gray-900">&larr; Back</button>
        <h1 className="text-2xl font-bold">Edit Listing</h1>
        {listing && (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            listing.status === 'published' ? 'bg-green-100 text-green-700' :
            listing.status === 'booked' ? 'bg-blue-100 text-blue-700' :
            listing.status === 'taken' ? 'bg-purple-100 text-purple-700' :
            listing.status === 'pending' ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>{listing.status}</span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Input label="Title" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />

        <div className="space-y-1">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">House Description</label>
          <textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label={`Viewing Fee (min. ${MIN_BOOKING_FEE})`} id="price" type="number" placeholder={String(MIN_BOOKING_FEE)} min={MIN_BOOKING_FEE} value={price} onChange={(e) => setPrice(e.target.value)} required />
          <Input label="Monthly Rent" id="rent" type="number" placeholder="e.g. 15000" value={rent} onChange={(e) => setRent(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Deposit (Refundable)" id="deposit" type="number" placeholder="e.g. 6500" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          <Input label="Electricity" id="electricity" placeholder="e.g. Self-Tokens" value={electricity} onChange={(e) => setElectricity(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Water" id="water" placeholder="e.g. Inclusive in Rent" value={water} onChange={(e) => setWater(e.target.value)} />
          <Input label="Why Vacant" id="whyVacant" placeholder="e.g. Previous tenant moved" value={whyVacant} onChange={(e) => setWhyVacant(e.target.value)} />
        </div>

        <div className="space-y-1">
          <label htmlFor="descriptiveLocation" className="block text-sm font-medium text-gray-700">Descriptive Location</label>
          <textarea id="descriptiveLocation" rows={2} placeholder="e.g. 20-30 min by foot, 5-10 min by motorbike KSh 50-70" value={descriptiveLocation} onChange={(e) => setDescriptiveLocation(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <Input label="Location (Area)" id="location" placeholder="e.g. Nairobi, Westlands" value={location} onChange={(e) => setLocation(e.target.value)} required />
        <Input label="YouTube Video URL (optional)" id="youtube" type="url" placeholder="https://youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
        <VideoUploader videoUrl={videoUrl} onChange={setVideoUrl} />

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">House Issues</label>
          <div className="flex gap-2">
            <input type="text" value={newIssue} onChange={(e) => setNewIssue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIssue())} placeholder="e.g. Leaky faucet, broken window..." className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <Button type="button" variant="outline" size="sm" onClick={addIssue}>Add</Button>
          </div>
          {issues.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {issues.map((issue, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200">
                  {issue}
                  <button type="button" onClick={() => removeIssue(i)} className="hover:text-red-600">&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="payment-method" className="block text-sm font-medium text-gray-700">Payment Method</label>
          <textarea id="payment-method" rows={2} placeholder="M-Pesa, Bank transfer details, etc." value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Photos</label>
          <ImageUploader images={images} onChange={setImages} />
          <p className="text-xs text-gray-400">Remove images by hovering and clicking the X. Upload new ones via the upload box.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl p-3">{success}</p>}

        <div className="flex gap-3">
          <Button type="submit" loading={saving} className="flex-1" size="lg">Save Changes</Button>
          <Button type="button" variant="outline" onClick={() => router.back()} size="lg">Cancel</Button>
        </div>
      </form>
    </div>
  )
}
