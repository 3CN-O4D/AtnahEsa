'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Check, ArrowLeft, Send } from 'lucide-react'
import Link from 'next/link'

const TOKEN_OPTIONS = [
  { id: 'self', label: 'Self-contained' },
  { id: 'inclusive', label: 'Inclusive' },
  { id: 'either', label: 'Open to either' },
]

const WATER_OPTIONS = [
  { id: 'included', label: 'Included in rent' },
  { id: 'own_borehole', label: 'Own borehole' },
  { id: 'either', label: 'Open to either' },
]

const HOUSE_DESIGNS = [
  { id: 'bedsitter', label: 'Bedsitter' },
  { id: 'studio', label: 'Studio' },
  { id: '1br', label: '1 Bedroom' },
  { id: '2br', label: '2 Bedroom' },
  { id: '3br', label: '3 Bedroom' },
  { id: 'bungalow', label: 'Bungalow' },
  { id: 'apartment', label: 'Apartment' },
  { id: 'townhouse', label: 'Townhouse' },
  { id: 'other', label: 'Other' },
]

const DEPOSIT_PREF_OPTIONS = [
  { id: 'required', label: 'Require deposit' },
  { id: 'not_required', label: 'No deposit needed' },
  { id: 'either', label: 'Open to either' },
]

const DEPOSIT_REFUND_OPTIONS = [
  { id: 'refundable', label: 'Refundable deposit' },
  { id: 'non_refundable', label: 'Non-refundable' },
  { id: 'either', label: 'Open to either' },
]

const BUILDING_TYPE_OPTIONS = [
  { id: 'flat', label: 'Flat / Ground floor' },
  { id: 'storey', label: 'Storey / Upstairs' },
  { id: 'either', label: 'Open to either' },
]

const ELECTRIC_BILL_OPTIONS = [
  { id: 'self_provided', label: 'Self provided' },
  { id: 'inclusive', label: 'Inclusive in rent' },
  { id: 'either', label: 'Open to either' },
]

const VACANCY_OPTIONS = [
  { id: 'vacant', label: 'Vacant now' },
  { id: 'any', label: 'Any time' },
]

function CheckboxGroup({ label, options, selected, onChange, hint }: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  hint?: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(active ? selected.filter((x) => x !== opt.id) : [...selected, opt.id])}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-400'
              }`}
            >
              {active && <Check className="w-3.5 h-3.5" />}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function RequestHousePage() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', location: '',
    min_rent: '', max_rent: '', description: '',
  })
  const [tokenOptions, setTokenOptions] = useState<string[]>([])
  const [waterOptions, setWaterOptions] = useState<string[]>([])
  const [houseDesigns, setHouseDesigns] = useState<string[]>([])
  const [depositPreference, setDepositPreference] = useState<string[]>([])
  const [depositRefundable, setDepositRefundable] = useState<string[]>([])
  const [buildingType, setBuildingType] = useState<string[]>([])
  const [houseTypeRequested, setHouseTypeRequested] = useState<string[]>([])
  const [electricBill, setElectricBill] = useState<string[]>([])
  const [vacancy, setVacancy] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/house-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          min_rent: form.min_rent ? Number(form.min_rent) : null,
          max_rent: form.max_rent ? Number(form.max_rent) : null,
          token_options: tokenOptions,
          water_options: waterOptions,
          house_designs: houseDesigns,
          deposit_preference: depositPreference,
          deposit_refundable: depositRefundable,
          building_type: buildingType,
          house_type_requested: houseTypeRequested,
          electric_bill: electricBill,
          vacancy: vacancy,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to submit'); setLoading(false); return }
      setSuccess(true)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2 dark:text-white">Request Submitted!</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">We&apos;ll search for houses matching your needs and notify you when we find them.</p>
        <Link href="/" className="text-sm text-blue-600 hover:underline">Back to Home</Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <button onClick={() => window.history.back()} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold mb-2 dark:text-white">Request a House</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Tell us what you&apos;re looking for and we&apos;ll help find it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contact Info</h2>
          <Input label="Full Name" id="name" value={form.name} onChange={(e) => update('name', e.target.value)} required />
          <Input label="Email" id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          <Input label="Phone Number" id="phone" type="tel" placeholder="0712 345 678" value={form.phone} onChange={(e) => update('phone', e.target.value)} required />
        </div>

        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">What I&apos;m Looking For</h2>

          <Input label="Preferred Location" id="location" placeholder="e.g. Eldoret, Nairobi..." value={form.location} onChange={(e) => update('location', e.target.value)} required />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Min Rent (KES)" id="min-rent" type="number" min="0" step="500" placeholder="0" value={form.min_rent} onChange={(e) => update('min_rent', e.target.value)} />
            <Input label="Max Rent (KES)" id="max-rent" type="number" min="0" step="500" placeholder="e.g. 15000" value={form.max_rent} onChange={(e) => update('max_rent', e.target.value)} />
          </div>

          <CheckboxGroup label="Token Type" options={TOKEN_OPTIONS} selected={tokenOptions} onChange={setTokenOptions} hint="Select all that apply" />
          <CheckboxGroup label="Water" options={WATER_OPTIONS} selected={waterOptions} onChange={setWaterOptions} hint="Select all that apply" />
          <CheckboxGroup label="House Design" options={HOUSE_DESIGNS} selected={houseDesigns} onChange={setHouseDesigns} hint="Select all that apply — you can pick multiple" />
          <CheckboxGroup label="Deposit" options={DEPOSIT_PREF_OPTIONS} selected={depositPreference} onChange={setDepositPreference} hint="Select all that apply" />
          <CheckboxGroup label="Deposit Type" options={DEPOSIT_REFUND_OPTIONS} selected={depositRefundable} onChange={setDepositRefundable} hint="Select all that apply" />
          <CheckboxGroup label="Building Type" options={BUILDING_TYPE_OPTIONS} selected={buildingType} onChange={setBuildingType} hint="Select all that apply" />
          <CheckboxGroup label="Electric Bill" options={ELECTRIC_BILL_OPTIONS} selected={electricBill} onChange={setElectricBill} hint="Select all that apply" />
          <CheckboxGroup label="Vacancy" options={VACANCY_OPTIONS} selected={vacancy} onChange={setVacancy} hint="Select all that apply" />

          <div className="space-y-1">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Additional Details</label>
            <textarea id="description" rows={4} placeholder="Tell us more about what you need..." value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3">{error}</p>}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          <Send className="w-4 h-4 mr-1.5" /> Submit Request
        </Button>

        <p className="text-xs text-gray-400 text-center">We&apos;ll match you with available houses and notify you.</p>
      </form>
    </div>
  )
}
