'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import ImageUploader from '@/components/upload/ImageUploader'
import VideoUploader from '@/components/upload/VideoUploader'
import { createClient } from '@/lib/supabase/client'
import { MIN_BOOKING_FEE } from '@/lib/constants'
import { normalizeTikTokUrl } from '@/lib/utils'
import { withCallbackUrl, currentPathWithSearch } from '@/lib/auth-redirect'
import type { User } from '@supabase/supabase-js'

const HOUSE_TYPES = ['Hostels', 'Mabati', '1 Bedroom (1BR)', '2 Bedroom (2BR)', '3+ Bedroom', 'BnB', 'Bedsitter/Studio', 'Apartment', 'Bungalow', 'Mansionette', 'Townhouse', 'Villa', 'Other']
const ELECTRIC_BILL_OPTS = ['Self Provided', 'Inclusive in Rent']
const WATER_BILL_OPTS = ['Self Provided', 'Inclusive in Rent']
const REASON_OPTS = ['Previous tenant moved out', 'Newly constructed']

export default function UploadPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [requestId, setRequestId] = useState('')
  const [requestLocation, setRequestLocation] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositRefundable, setDepositRefundable] = useState(true)
  const [electricBill, setElectricBill] = useState('')
  const [water, setWater] = useState('')
  const [vacancy, setVacancy] = useState('vacant')
  const [whyVacant, setWhyVacant] = useState('')
  const [houseType, setHouseType] = useState('')
  const [customHouseType, setCustomHouseType] = useState('')
  const [bedroomCount, setBedroomCount] = useState('')
  const [buildingType, setBuildingType] = useState('')
  const [floorNumber, setFloorNumber] = useState('')
  const [descriptiveLocation, setDescriptiveLocation] = useState('')
  const [location, setLocation] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [tiktokUrl, setTiktokUrl] = useState('')
  const [videoUrls, setVideoUrls] = useState<string[]>([])
  const [issues, setIssues] = useState<string[]>([])
  const [newIssue, setNewIssue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [listerPhone, setListerPhone] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push(withCallbackUrl('/auth/signup?role=lister', currentPathWithSearch()))
      else setUser(data.user)
    })
  }, [router])

  // Arriving from "I have this house": prefill what the requester asked for.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = new URLSearchParams(window.location.search).get('request') || ''
    if (!id) return
    setRequestId(id)

    const supabase = createClient()
    supabase
      .from('house_requests_public')
      .select('location, min_rent, max_rent, house_designs, water_options, description, deposit_preference')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setRequestLocation(data.location || '')
        setLocation((prev) => prev || data.location || '')
        setRent((prev) => prev || String(data.max_rent ?? data.min_rent ?? ''))
        setDescription((prev) => prev || [
          data.description,
          data.house_designs?.length ? `Looking for: ${data.house_designs.join(', ')}.` : '',
        ].filter(Boolean).join(' '))

        const designMap: Record<string, string> = {
          bedsitter: 'Bedsitter/Studio',
          studio: 'Bedsitter/Studio',
          '1br': '1 Bedroom (1BR)',
          '2br': '2 Bedroom (2BR)',
          '3br': '3+ Bedroom',
          bungalow: 'Bungalow',
          apartment: 'Apartment',
          townhouse: 'Townhouse',
          other: 'Other',
        }
        const requested = Array.isArray(data.house_designs) ? data.house_designs[0] : ''
        if (requested && designMap[requested]) setHouseType((prev) => prev || designMap[requested])

        const water = Array.isArray(data.water_options) ? data.water_options[0] : ''
        if (water === 'included') setWater((prev) => prev || 'Inclusive in Rent')
        else if (water === 'own_borehole') setWater((prev) => prev || 'Self Provided')

        setTitle((prev) => prev || `${designMap[requested] || 'House'} in ${data.location || 'Kenya'}`)
      })
  }, [])

  const addIssue = () => {
    if (newIssue.trim()) {
      setIssues([...issues, newIssue.trim()])
      setNewIssue('')
    }
  }

  const removeIssue = (index: number) => {
    setIssues(issues.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (mediaUploading) {
      setError('Please wait for the photos and videos to finish uploading.')
      return
    }
    if (images.length === 0) {
      setError('Add at least one photo so hunters can see the house.')
      return
    }

    const fee = parseInt(price)
    if (fee < MIN_BOOKING_FEE) {
      setError(`Minimum booking fee is ${MIN_BOOKING_FEE}`)
      return
    }

    setLoading(true)
    setError('')

    try {
      // Normalize TikTok URL
      const normalizedTikTokUrl = tiktokUrl ? normalizeTikTokUrl(tiktokUrl) : null

      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          price: fee,
          rent: parseInt(rent) || 0,
          deposit: parseInt(deposit) || 0,
          deposit_refundable: depositRefundable,
          electric_bill: electricBill,
          water,
          vacancy,
          why_vacant: whyVacant,
          house_type: houseType === '3+ Bedroom' ? `3+ Bedroom (${bedroomCount})` : houseType === 'Other' ? customHouseType : houseType,
          building_type: buildingType,
          floor_number: floorNumber,
          descriptive_location: descriptiveLocation,
          location,
          images,
          youtube_url: youtubeUrl || null,
          tiktok_url: normalizedTikTokUrl,
          video_urls: videoUrls,
          issues,
          issues_count: issues.length,
          payment_method: paymentMethod,
          lister_phone: listerPhone,
          request_id: requestId || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to submit listing')
      } else {
        router.push('/my-listings')
      }
    } catch {
      setError('Failed to submit listing')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <img src="/images/asehanta-logo.jpeg" alt="AseHanta" className="h-10 w-10 rounded-full object-cover" />
        <h1 className="text-2xl font-bold">List Your House</h1>
      </div>

      {requestId && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
            <Upload className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Uploading for a house request{requestLocation ? ` in ${requestLocation}` : ''}</p>
            <p className="mt-0.5 text-xs opacity-80">
              Your house will be linked to this request. Once it is uploaded, the requester is sent to your public listings page to pick it. Claiming never shares contact details — those unlock after a paid booking.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Title"
          id="title"
          placeholder="e.g. 2BR Modern Apartment in Westlands"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className="space-y-1">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            House Description
          </label>
          <textarea
            id="description"
            rows={4}
            placeholder="Describe the house, amenities, nearby facilities..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        {/* House Type */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">House Type</label>
          <div className="flex flex-wrap gap-2">
            {HOUSE_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => setHouseType(t)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${houseType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                {t}
              </button>
            ))}
          </div>
          {houseType === 'Other' && (
            <input type="text" value={customHouseType} onChange={(e) => setCustomHouseType(e.target.value)}
              placeholder="Enter house type"
              className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          )}
          {houseType === '3+ Bedroom' && (
            <input type="text" value={bedroomCount} onChange={(e) => setBedroomCount(e.target.value)}
              placeholder="How many bedrooms? (e.g. 4)"
              className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          )}
        </div>

        {/* Building Type */}
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
          {buildingType === 'storey' && (
            <input type="text" value={floorNumber} onChange={(e) => setFloorNumber(e.target.value)}
              placeholder="Which floor? (e.g. 2nd Floor)"
              className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={`Hunting Fee (min. ${MIN_BOOKING_FEE})`}
            id="price"
            type="number"
            placeholder={String(MIN_BOOKING_FEE)}
            min={MIN_BOOKING_FEE}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <Input
            label="Monthly Rent"
            id="rent"
            type="number"
            placeholder="e.g. 15000"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
            required
          />
        </div>

        {/* Deposit */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Deposit Amount"
            id="deposit"
            type="number"
            placeholder="e.g. 6500"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Deposit Type</label>
            <select value={depositRefundable ? 'refundable' : 'non-refundable'}
              onChange={(e) => setDepositRefundable(e.target.value === 'refundable')}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="refundable">Refundable</option>
              <option value="non-refundable">Non-Refundable</option>
            </select>
          </div>
        </div>

        {/* Electric Bill */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Electric Bill</label>
          <div className="flex flex-wrap gap-2">
            {ELECTRIC_BILL_OPTS.map((opt) => (
              <button key={opt} type="button" onClick={() => setElectricBill(opt)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${electricBill === opt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Water Bill */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Water Bill</label>
          <div className="flex flex-wrap gap-2">
            {WATER_BILL_OPTS.map((opt) => (
              <button key={opt} type="button" onClick={() => setWater(opt)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${water === opt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Lister Phone (visible to admin)"
          id="listerPhone"
          type="tel"
          placeholder="e.g. 0712345678"
          value={listerPhone}
          onChange={(e) => setListerPhone(e.target.value)}
        />

        {/* Vacancy */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Vacancy Status</label>
          <select value={vacancy} onChange={(e) => setVacancy(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="vacant">Vacant</option>
            <option value="pending">Pending</option>
          </select>
          {vacancy === 'vacant' && (
            <div className="mt-2 space-y-1">
              <label className="block text-sm font-medium text-gray-700">Reason for Vacancy</label>
              <div className="flex flex-wrap gap-2">
                {REASON_OPTS.map((opt) => (
                  <button key={opt} type="button" onClick={() => setWhyVacant(opt)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${whyVacant === opt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="descriptiveLocation" className="block text-sm font-medium text-gray-700">
            Descriptive Location
          </label>
          <textarea
            id="descriptiveLocation"
            rows={2}
            placeholder="e.g. 20-30 min by foot, 5-10 min by motorbike KSh 50-70, KSh 20-30 by matatu"
            value={descriptiveLocation}
            onChange={(e) => setDescriptiveLocation(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <Input
          label="Location (Area)"
          id="location"
          placeholder="e.g. Nairobi, Westlands"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />

        <Input
          label="YouTube Video URL (optional)"
          id="youtube"
          type="url"
          placeholder="https://youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
        />

        <Input
          label="TikTok Video URL (optional)"
          id="tiktok"
          type="url"
          placeholder="https://www.tiktok.com/@username/video/..."
          value={tiktokUrl}
          onChange={(e) => setTiktokUrl(e.target.value)}
        />

        <VideoUploader videoUrls={videoUrls} onChange={setVideoUrls} onUploadingChange={setMediaUploading} />

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">House Issues</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newIssue}
              onChange={(e) => setNewIssue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIssue())}
              placeholder="e.g. Leaky faucet, broken window..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button type="button" variant="outline" size="sm" onClick={addIssue}>
              Add
            </Button>
          </div>
          {issues.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {issues.map((issue, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200"
                >
                  {issue}
                  <button type="button" onClick={() => removeIssue(i)} className="hover:text-red-600">&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="payment-method" className="block text-sm font-medium text-gray-700">
            Payment Method <span className="text-gray-400 font-normal">(visible only to admin)</span>
          </label>
          <textarea
            id="payment-method"
            rows={2}
            placeholder="M-Pesa, Bank transfer details, etc."
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Photos</label>
          <ImageUploader images={images} onChange={setImages} onUploadingChange={setMediaUploading} />
        </div>

        {mediaUploading && (
          <p className="text-sm text-blue-600">Uploading media… the submit button unlocks when everything finishes.</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
          <p><strong>Revenue Share:</strong> You earn <strong>70%</strong> of the booking fee. AseHanta takes <strong>30%</strong></p>
          <p><strong>Note:</strong> Your listing will be reviewed by admin before it goes live.</p>
        </div>

        <Button type="submit" loading={loading} disabled={mediaUploading} className="w-full" size="lg">
          {mediaUploading ? 'Uploading media…' : 'Submit for Review'}
        </Button>
      </form>
    </div>
  )
}
