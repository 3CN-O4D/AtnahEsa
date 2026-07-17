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

const HOUSE_TYPES = ['Hostels', 'Mabati', '1 Bedroom (1BR)', '2 Bedroom (2BR)', '3+ Bedroom', 'BnB', 'Bedsitter/Studio', 'Apartment', 'Bungalow', 'Mansionette', 'Townhouse', 'Villa', 'Other']
const ELECTRIC_BILL_OPTS = ['Self Provided', 'Inclusive in Rent']


export default function EditListingPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositRefundable, setDepositRefundable] = useState(true)
  const [electricBill, setElectricBill] = useState('')
  const [water, setWater] = useState('')
  const [vacancy, setVacancy] = useState('vacant')
  const [houseType, setHouseType] = useState('')
  const [customHouseType, setCustomHouseType] = useState('')
  const [bedroomCount, setBedroomCount] = useState('')
  const [buildingType, setBuildingType] = useState('')
  const [floorNumber, setFloorNumber] = useState('')
  const [descriptiveLocation, setDescriptiveLocation] = useState('')
  const [location, setLocation] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [newIssue, setNewIssue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [listerPhone, setListerPhone] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [originalImages, setOriginalImages] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }

      const { data } = await supabase.from('listings').select('*').eq('id', id).single()
      if (!data || data.uploader_id !== user.id) { router.push('/my-listings'); return }

      const l = data as Listing
      setTitle(l.title)
      setDescription(l.description)
      setPrice(String(l.price))
      setRent(String(l.rent))
      setDeposit(String(l.deposit))
      setDepositRefundable(l.deposit_refundable)
      setElectricBill(l.electric_bill)
      setWater(l.water)
      setVacancy(l.vacancy || 'vacant')
      setHouseType(l.house_type || '')
      setBuildingType(l.building_type || '')
      setFloorNumber(l.floor_number || '')
      setDescriptiveLocation(l.descriptive_location)
      setLocation(l.location)
      setYoutubeUrl(l.youtube_url ?? '')
      setVideoUrl(l.video_url ?? '')
      setIssues(l.issues)
      setPaymentMethod(l.payment_method)
      setListerPhone(l.lister_phone || '')
      setImages(l.images)
      setOriginalImages(l.images)
      setLoading(false)
    })
  }, [id, router])

  const addIssue = () => {
    if (newIssue.trim()) { setIssues([...issues, newIssue.trim()]); setNewIssue('') }
  }
  const removeIssue = (index: number) => setIssues(issues.filter((_, i) => i !== index))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    const fee = parseInt(price)
    if (fee < MIN_BOOKING_FEE) { setError(`Minimum booking fee is ${MIN_BOOKING_FEE}`); return }
    setSaving(true)

    try {
      const supabase = createClient()
      const removed = originalImages.filter((url) => !images.includes(url))
      await Promise.allSettled(removed.map((url) => fetch('/api/delete-image', { method: 'POST', body: JSON.stringify({ url }) })))

      const { error: updateErr } = await supabase.from('listings').update({
        title, description, price: fee, rent: parseInt(rent) || 0,
        deposit: parseInt(deposit) || 0, deposit_refundable: depositRefundable,
        electric_bill: electricBill, water, vacancy,
        house_type: houseType === '3+ Bedroom' ? `3+ Bedroom (${bedroomCount})` : houseType === 'Other' ? customHouseType : houseType,
        building_type: buildingType, floor_number: floorNumber,
        descriptive_location: descriptiveLocation, location,
        images, youtube_url: youtubeUrl || null, video_url: videoUrl || null,
        issues, issues_count: issues.length, payment_method: paymentMethod, lister_phone: listerPhone,
      }).eq('id', id)

      if (updateErr) { setError(updateErr.message); return }
      setSuccess('Saved!'); setOriginalImages(images)
    } catch { setError('Failed to save') } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-600 hover:text-gray-900">&larr; Back</button>
        <h1 className="text-2xl font-bold">Edit Listing</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Input label="Title" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <div className="space-y-1">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">House Description</label>
          <textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">House Type</label>
          <div className="flex flex-wrap gap-2">
            {HOUSE_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => setHouseType(t)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${houseType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>{t}</button>
            ))}
          </div>
          {houseType === 'Other' && <input type="text" value={customHouseType} onChange={(e) => setCustomHouseType(e.target.value)} placeholder="Enter house type" className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />}
          {houseType === '3+ Bedroom' && <input type="text" value={bedroomCount} onChange={(e) => setBedroomCount(e.target.value)} placeholder="How many bedrooms?" className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Building Type</label>
          <div className="flex gap-2">
            {['flat', 'storey'].map((bt) => (
              <button key={bt} type="button" onClick={() => setBuildingType(bt === buildingType ? '' : bt)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${buildingType === bt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                {bt === 'flat' ? 'Flat / Ground Floor' : 'Storey / Upstairs'}
              </button>
            ))}
          </div>
          {buildingType === 'storey' && <input type="text" value={floorNumber} onChange={(e) => setFloorNumber(e.target.value)} placeholder="Which floor?" className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label={`Hunting Fee (min. ${MIN_BOOKING_FEE})`} id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} required />
          <Input label="Monthly Rent" id="rent" type="number" value={rent} onChange={(e) => setRent(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Deposit Amount" id="deposit" type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Deposit Type</label>
            <select value={depositRefundable ? 'refundable' : 'non-refundable'} onChange={(e) => setDepositRefundable(e.target.value === 'refundable')}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="refundable">Refundable</option>
              <option value="non-refundable">Non-Refundable</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Electric Bill</label>
          <div className="flex flex-wrap gap-2">
            {ELECTRIC_BILL_OPTS.map((opt) => (
              <button key={opt} type="button" onClick={() => setElectricBill(opt)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${electricBill === opt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>{opt}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Water" id="water" value={water} onChange={(e) => setWater(e.target.value)} />
          <Input label="Lister Phone" id="listerPhone" type="tel" value={listerPhone} onChange={(e) => setListerPhone(e.target.value)} />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Vacancy Status</label>
          <select value={vacancy} onChange={(e) => setVacancy(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="vacant">Vacant</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="descriptiveLocation" className="block text-sm font-medium text-gray-700">Descriptive Location</label>
          <textarea id="descriptiveLocation" rows={2} value={descriptiveLocation} onChange={(e) => setDescriptiveLocation(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <Input label="Location (Area)" id="location" value={location} onChange={(e) => setLocation(e.target.value)} required />
        <Input label="YouTube Video URL" id="youtube" type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
        <VideoUploader videoUrl={videoUrl} onChange={setVideoUrl} />

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">House Issues</label>
          <div className="flex gap-2">
            <input type="text" value={newIssue} onChange={(e) => setNewIssue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIssue())} placeholder="e.g. Leaky faucet..." className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <Button type="button" variant="outline" size="sm" onClick={addIssue}>Add</Button>
          </div>
          {issues.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {issues.map((issue, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200">
                  {issue} <button type="button" onClick={() => removeIssue(i)} className="hover:text-red-600">&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="payment-method" className="block text-sm font-medium text-gray-700">Payment Method <span className="text-gray-400">(admin only)</span></label>
          <textarea id="payment-method" rows={2} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Photos</label>
          <ImageUploader images={images} onChange={setImages} />
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
