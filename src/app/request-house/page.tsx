'use client'

import { useMemo, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Clock,
  Home as HomeIcon,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { getWhatsAppLink, isValidPhone, isValidWhatsAppContact } from '@/lib/whatsapp'
import { WHATSAPP_NUMBER } from '@/lib/constants'

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FormState = {
  name: string
  email: string
  phone: string
  whatsapp: string
  location: string
  min_rent: string
  max_rent: string
  description: string
}

function FieldGroup({
  step,
  title,
  description,
  icon: Icon,
  children,
}: {
  step: string
  title: string
  description?: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <section className="relative rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/80 dark:bg-slate-900/80 p-5 sm:p-6 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
            Step {step}
          </p>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white leading-tight">
            {title}
          </h2>
          {description && <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function CheckboxGroup({ label, options, selected, onChange, hint, error }: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  hint?: string
  error?: string
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</legend>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? selected.filter((x) => x !== opt.id) : [...selected, opt.id])}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200 active:scale-[0.97] ${
                active
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 -translate-y-0.5'
                  : 'bg-white/70 dark:bg-slate-800/70 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:-translate-y-0.5'
              }`}
            >
              <span className={`grid place-items-center rounded-full transition-all ${active ? 'w-3.5 h-3.5 bg-white/20' : 'w-0 h-0 opacity-0'}`}>
                {active && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
              {opt.label}
            </button>
          )
        })}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </fieldset>
  )
}

export default function RequestHousePage() {
  const [form, setForm] = useState<FormState>({
    name: '', email: '', phone: '', whatsapp: '', location: '',
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
  const [whatsappTouched, setWhatsappTouched] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const supportLink = useMemo(
    () => getWhatsAppLink(WHATSAPP_NUMBER, 'Hi AseHanta, I have a question about my house request.'),
    []
  )

  const update = (field: keyof FormState, value: string) => {
    if (field === 'whatsapp') setWhatsappTouched(true)
    setForm((prev) => {
      if (field === 'phone' && !whatsappTouched) {
        return { ...prev, phone: value, whatsapp: value }
      }
      return { ...prev, [field]: value }
    })
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    if (error) setError('')
  }

  const resetWhatsAppToPhone = () => {
    setWhatsappTouched(false)
    setForm((prev) => ({ ...prev, whatsapp: prev.phone }))
    setFieldErrors((prev) => {
      if (!prev.whatsapp) return prev
      const next = { ...prev }
      delete next.whatsapp
      return next
    })
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (form.name.trim().length < 2) next.name = 'Please enter your full name.'
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email, e.g. you@example.com.'
    if (!isValidPhone(form.phone)) next.phone = 'Enter a valid phone number, e.g. 0712 345 678.'
    if (form.location.trim().length < 2) next.location = 'Tell us the town or area you are looking in.'
    if (form.whatsapp.trim() && !isValidWhatsAppContact(form.whatsapp)) {
      next.whatsapp = 'Use a phone number like 0712 345 678 or a username like @janedoe.'
    }
    if (form.description.length > 2000) next.description = 'Please keep this under 2,000 characters.'

    const min = form.min_rent ? Number(form.min_rent) : null
    const max = form.max_rent ? Number(form.max_rent) : null
    if (min !== null && (!Number.isFinite(min) || min < 0)) next.min_rent = 'Enter a valid amount.'
    if (max !== null && (!Number.isFinite(max) || max < 0)) next.max_rent = 'Enter a valid amount.'
    if (min !== null && max !== null && min > max) next.max_rent = 'Maximum rent must be at least the minimum.'

    setFieldErrors(next)
    return next
  }

  const focusFirstError = (errors: Record<string, string>) => {
    const order = ['name', 'email', 'phone', 'whatsapp', 'location', 'min-rent', 'max-rent', 'description']
    const key = Object.keys(errors)[0]
    if (!key) return
    const id = key === 'min_rent' ? 'min-rent' : key === 'max_rent' ? 'max-rent' : key
    const el = document.getElementById(id) || document.getElementById(order.find((o) => errors[o]) || '')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    ;(el as HTMLElement | null)?.focus?.()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setError('A few details need your attention before we can send this request.')
      focusFirstError(errors)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/house-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          whatsapp: form.whatsapp.trim() || form.phone,
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
          vacancy,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === 'object') {
          setFieldErrors(data.fieldErrors as Record<string, string>)
        }
        setError(data.error || 'We could not send your request. Please try again.')
        return
      }
      setSuccess(true)
    } catch {
      setError('We could not reach the server. Check your connection and try again — your details are still here.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -right-20 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative max-w-xl mx-auto px-4 py-16 sm:py-24">
          <div className="rounded-3xl border border-gray-200/80 dark:border-gray-700 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur p-7 sm:p-10 text-center animate-scaleIn">
            <div className="relative w-20 h-20 mx-auto mb-5">
              <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
              <div className="relative w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">Request received</h1>
            <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base mb-6">
              Thank you, {form.name.split(' ')[0] || 'friend'}. Our team will search for homes that match what you described
              and reach you on WhatsApp.
            </p>

            <div className="rounded-2xl bg-gray-50 dark:bg-slate-800/70 border border-gray-100 dark:border-gray-700 p-4 text-left space-y-3 mb-6">
              {[
                { icon: Clock, text: 'We review your request within 24 hours.' },
                { icon: MessageCircle, text: 'A matching lister or our team messages you on WhatsApp.' },
                { icon: HomeIcon, text: 'You view the house before paying anything.' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                  <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link href="/" className="inline-flex">
                <Button className="w-full sm:w-auto">
                  Browse houses <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
              {supportLink && (
                <a href={supportLink} target="_blank" rel="noopener noreferrer" className="inline-flex">
                  <Button variant="outline" className="w-full sm:w-auto">
                    <MessageCircle className="w-4 h-4 mr-1.5" /> Chat with us
                  </Button>
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSuccess(false)
                setForm({ name: '', email: '', phone: '', whatsapp: '', location: '', min_rent: '', max_rent: '', description: '' })
                setWhatsappTouched(false)
                setTokenOptions([]); setWaterOptions([]); setHouseDesigns([])
                setDepositPreference([]); setDepositRefundable([]); setBuildingType([])
                setHouseTypeRequested([]); setElectricBill([]); setVacancy([])
              }}
              className="mt-5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Submit another request
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-blue-400/15 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-indigo-400/15 blur-3xl" />

      <div className="relative max-w-5xl mx-auto px-4 py-8 lg:py-12">
        <button
          onClick={() => window.history.back()}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" /> Back
        </button>

        <header className="mb-8 animate-fadeIn">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
            <Sparkles className="w-3.5 h-3.5" /> Free · no account needed
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            Tell us what home you&apos;re looking for
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-gray-600 dark:text-gray-300">
            Share the essentials once. We&apos;ll match you with homes that fit your budget and reach you on WhatsApp.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {[
              { icon: Clock, label: 'Reply within 24 hours' },
              { icon: ShieldCheck, label: 'No upfront payment' },
              { icon: BadgeCheck, label: 'Verified listers only' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 dark:bg-slate-800/70 border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-gray-600 dark:text-gray-300">
                <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> {label}
              </span>
            ))}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <form onSubmit={handleSubmit} noValidate className="space-y-5 animate-slideUp">
            {error && (
              <div role="alert" aria-live="assertive" className="flex items-start gap-2.5 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300 animate-shake">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white">!</span>
                <p>{error}</p>
              </div>
            )}

            <FieldGroup step="1" title="How can we reach you?" description="We only use these details to help with this request." icon={Phone}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full name"
                  id="name"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  error={fieldErrors.name}
                  placeholder="Jane Doe"
                />
                <Input
                  label="Email address"
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  error={fieldErrors.email}
                  placeholder="you@example.com"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Phone number"
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0712 345 678"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  error={fieldErrors.phone}
                />
                <div>
                  <Input
                    label="WhatsApp contact"
                    id="whatsapp"
                    type="text"
                    inputMode="text"
                    placeholder="0712 345 678 or @janedoe"
                    value={form.whatsapp}
                    onChange={(e) => update('whatsapp', e.target.value)}
                    error={fieldErrors.whatsapp}
                  />
                  <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/60 px-2.5 py-2">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                      Prefilled with your phone number. You can edit it or use your WhatsApp username (e.g.{' '}
                      <span className="font-semibold">@janedoe</span>).
                    </p>
                  </div>
                  {whatsappTouched && form.phone && form.whatsapp !== form.phone && (
                    <button
                      type="button"
                      onClick={resetWhatsAppToPhone}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300"
                    >
                      <RotateCcw className="w-3 h-3" /> Use my phone number instead
                    </button>
                  )}
                </div>
              </div>
            </FieldGroup>

            <FieldGroup step="2" title="What are you looking for?" description="The more you tell us, the better the matches." icon={MapPin}>
              <Input
                label="Preferred location"
                id="location"
                placeholder="e.g. Eldoret, Nairobi, Kapsabet…"
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
                error={fieldErrors.location}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Minimum rent (KES)"
                  id="min-rent"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="500"
                  placeholder="0"
                  value={form.min_rent}
                  onChange={(e) => update('min_rent', e.target.value)}
                  error={fieldErrors.min_rent}
                />
                <Input
                  label="Maximum rent (KES)"
                  id="max-rent"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="500"
                  placeholder="e.g. 15000"
                  value={form.max_rent}
                  onChange={(e) => update('max_rent', e.target.value)}
                  error={fieldErrors.max_rent}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <CheckboxGroup label="House design" options={HOUSE_DESIGNS} selected={houseDesigns} onChange={setHouseDesigns} hint="Pick all that work for you." />
                <CheckboxGroup label="Token type" options={TOKEN_OPTIONS} selected={tokenOptions} onChange={setTokenOptions} />
                <CheckboxGroup label="Water" options={WATER_OPTIONS} selected={waterOptions} onChange={setWaterOptions} />
                <CheckboxGroup label="Building type" options={BUILDING_TYPE_OPTIONS} selected={buildingType} onChange={setBuildingType} />
                <CheckboxGroup label="Deposit" options={DEPOSIT_PREF_OPTIONS} selected={depositPreference} onChange={setDepositPreference} />
                <CheckboxGroup label="Deposit type" options={DEPOSIT_REFUND_OPTIONS} selected={depositRefundable} onChange={setDepositRefundable} />
                <CheckboxGroup label="Electric bill" options={ELECTRIC_BILL_OPTIONS} selected={electricBill} onChange={setElectricBill} />
                <CheckboxGroup label="Vacancy" options={VACANCY_OPTIONS} selected={vacancy} onChange={setVacancy} />
              </div>
            </FieldGroup>

            <FieldGroup step="3" title="Anything else we should know?" description="Optional, but helpful for finding the right fit." icon={Wallet}>
              <div className="space-y-1.5">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Additional details
                </label>
                <textarea
                  id="description"
                  rows={4}
                  maxLength={2200}
                  placeholder="e.g. I need a quiet place near town, with a separate kitchen and secure parking."
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  className="block w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-3 py-2.5 text-sm shadow-sm transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <div className="flex items-center justify-between gap-3">
                  {fieldErrors.description ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.description}</p>
                  ) : (
                    <p className="text-xs text-gray-400">You can add or change details later.</p>
                  )}
                  <span className={`text-xs tabular-nums ${form.description.length > 2000 ? 'text-red-500' : 'text-gray-400'}`}>
                    {form.description.length}/2000
                  </span>
                </div>
              </div>
            </FieldGroup>

            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5 backdrop-blur">
              <Button type="submit" loading={loading} className="w-full" size="lg">
                <Send className="w-4 h-4 mr-1.5" /> Send my request
              </Button>
              <p className="mt-2.5 text-center text-xs text-gray-500 dark:text-gray-400">
                Free to send. We&apos;ll only contact you about this request.
              </p>
            </div>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white/85 dark:bg-slate-900/85 p-5 backdrop-blur shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" /> How it works
              </h2>
              <ol className="space-y-4">
                {[
                  { title: 'Tell us what you need', text: 'Share your budget, location and must-haves.' },
                  { title: 'We match you', text: 'Our team and verified listers look for homes that fit.' },
                  { title: 'Chat on WhatsApp', text: 'We reach you on the contact you gave us and arrange a viewing.' },
                ].map((item, i) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 dark:bg-blue-900/40 text-xs font-bold text-blue-700 dark:text-blue-300">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{item.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-5">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Your privacy matters</p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
                    Your contact details stay hidden from the public. Only our team and the lister you match with can reach you.
                  </p>
                </div>
              </div>
            </div>

            {supportLink && (
              <a
                href={supportLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white/85 dark:bg-slate-900/85 p-4 backdrop-blur shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                  <MessageCircle className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">Need help first?</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Chat with our team on WhatsApp</span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 ml-auto transition-transform group-hover:translate-x-0.5" />
              </a>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 px-1">
              <Mail className="w-3.5 h-3.5" />
              <span>Prefer email? Write to asehanta@gmail.com</span>
            </div>
          </aside>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          By sending this request you agree to be contacted about houses that match it.
        </p>
      </div>
    </div>
  )
}
