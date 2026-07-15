'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import ImageUploader from '@/components/upload/ImageUploader'
import { createClient } from '@/lib/supabase/client'
import { MIN_BOOKING_FEE } from '@/lib/constants'
import type { User } from '@supabase/supabase-js'

export default function AdminUploadPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
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
  const [issues, setIssues] = useState<string[]>([])
  const [newIssue, setNewIssue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [listerName, setListerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push('/auth/signin')
        return
      }
      setUser(data.user)

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (profile?.role !== 'admin') {
        router.push('/')
      } else {
        setIsAdmin(true)
      }
    })
  }, [router])

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

    const fee = parseInt(price)
    if (fee < MIN_BOOKING_FEE) {
      setError(`Minimum booking fee is ${MIN_BOOKING_FEE}`)
      return
    }

    setLoading(true)
    setError('')

    try {
      const supabase = createClient()

      const { error: err } = await supabase.from('listings').insert({
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
        issues,
        issues_count: issues.length,
        payment_method: paymentMethod,
        status: 'published',
        uploader_id: user.id,
        uploader_name: listerName || 'AseHanta Admin',
      })

      if (err) {
        setError(err.message)
      } else {
        router.push('/admin')
      }
    } catch {
      setError('Failed to create listing')
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <img src="/images/asehanta-logo.jpeg" alt="AseHanta" className="h-10 w-10 rounded-full object-cover" />
        <h1 className="text-2xl font-bold">Admin: List a House</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Listing will be published immediately (no review needed).
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Title"
          id="title"
          placeholder="e.g. 2BR Modern Apartment in Westlands"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <Input
          label="Lister Name (shown to customers)"
          id="listerName"
          placeholder="e.g. John Doe or AseHanta"
          value={listerName}
          onChange={(e) => setListerName(e.target.value)}
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

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={`Viewing Fee (min. ${MIN_BOOKING_FEE})`}
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

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Deposit (Refundable)"
            id="deposit"
            type="number"
            placeholder="e.g. 6500"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
          <Input
            label="Electricity"
            id="electricity"
            placeholder="e.g. Self-Tokens"
            value={electricity}
            onChange={(e) => setElectricity(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Water"
            id="water"
            placeholder="e.g. Inclusive in Rent"
            value={water}
            onChange={(e) => setWater(e.target.value)}
          />
          <Input
            label="Why Vacant"
            id="whyVacant"
            placeholder="e.g. Previous tenant moved"
            value={whyVacant}
            onChange={(e) => setWhyVacant(e.target.value)}
          />
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
            Payment Method
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
          <ImageUploader images={images} onChange={setImages} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Publish Listing
        </Button>
      </form>
    </div>
  )
}