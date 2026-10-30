'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Bug,
  MessageSquareWarning,
  CreditCard,
  Home,
  UserRound,
  Lightbulb,
  HelpCircle,
  Send,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Clock3,
} from 'lucide-react'

const CATEGORIES = [
  { value: 'bug', label: 'Website bug', icon: Bug, hint: 'Something broke or behaves oddly' },
  { value: 'complaint', label: 'Complaint', icon: MessageSquareWarning, hint: 'An experience that went wrong' },
  { value: 'payment', label: 'Payment issue', icon: CreditCard, hint: 'STK, refund or escrow problem' },
  { value: 'listing', label: 'Listing problem', icon: Home, hint: 'Fake, wrong or misleading house' },
  { value: 'account', label: 'Account', icon: UserRound, hint: 'Login, profile or verification' },
  { value: 'feature', label: 'Feature request', icon: Lightbulb, hint: 'Something you would like to see' },
  { value: 'other', label: 'Something else', icon: HelpCircle, hint: 'Anything not covered above' },
] as const

type Category = (typeof CATEGORIES)[number]['value']

export default function ComplaintsPage() {
  const [category, setCategory] = useState<Category>('bug')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, category, subject, message }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Could not send your report. Please try again.')
        return
      }
      setTicket(String(data.id || '').slice(0, 8).toUpperCase())
      setName('')
      setEmail('')
      setPhone('')
      setSubject('')
      setMessage('')
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-[#30B54A]/10 via-transparent to-transparent" />

      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#30B54A]/25 bg-[#e8f8eb] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#2a9c40] dark:border-[#30B54A]/30 dark:bg-[#30B54A]/15 dark:text-[#6fdc84]">
          <ShieldCheck className="h-3.5 w-3.5" />
          We read every report
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Complaints &amp; bug reports
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:text-base">
          Found a broken button, a payment that will not confirm, or a listing that is not what it promised?
          Tell us exactly what happened. Reports land in the admin queue with a reference number you can quote.
        </p>
      </div>

      {ticket ? (
        <div className="mt-8 max-w-2xl overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm animate-scaleIn dark:border-emerald-900/60 dark:bg-slate-900">
          <div className="flex items-start gap-4 p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Report received</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Your reference is{' '}
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono font-bold text-gray-900 dark:bg-slate-800 dark:text-white">
                  {ticket}
                </span>
                . Our team will review it and reach out by email if we need more detail.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTicket(null)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#30B54A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a9c40]"
                >
                  Send another report
                </button>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"
                >
                  Back home
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <fieldset>
              <legend className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                What is this about?
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORIES.map(({ value, label, icon: Icon, hint }) => {
                  const active = category === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      title={hint}
                      className={`flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all ${
                        active
                          ? 'border-[#30B54A] bg-[#e8f8eb] text-[#2a9c40] shadow-sm dark:border-[#30B54A] dark:bg-[#30B54A]/15 dark:text-[#6fdc84]'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold leading-tight">{label}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Your name</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#30B54A] focus:ring-2 focus:ring-[#30B54A]/25 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Jane Wanjiku"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Email</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#30B54A] focus:ring-2 focus:ring-[#30B54A]/25 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="you@example.com"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Phone (optional)</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#30B54A] focus:ring-2 focus:ring-[#30B54A]/25 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="07xx xxx xxx"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Subject</span>
                <input
                  required
                  maxLength={140}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#30B54A] focus:ring-2 focus:ring-[#30B54A]/25 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Short summary"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">What happened?</span>
              <textarea
                required
                minLength={10}
                maxLength={4000}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#30B54A] focus:ring-2 focus:ring-[#30B54A]/25 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Tell us the steps, what you expected, and what actually happened. Include a listing name or payment reference if you have one."
              />
            </label>

            {error && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#30B54A] to-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Sending…' : 'Send report'}
            </button>
          </form>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                <Clock3 className="h-4 w-4 text-[#30B54A]" />
                What happens next
              </h2>
              <ol className="mt-4 space-y-4">
                {[
                  ['We log it', 'Your report enters the admin queue with a reference number.'],
                  ['We investigate', 'Payments are checked against PayWave; listings are checked against what was advertised.'],
                  ['We act', 'Refunds, corrections or fixes are applied, and we reply by email.'],
                ].map(([title, body], index) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8f8eb] text-[11px] font-bold text-[#2a9c40] dark:bg-[#30B54A]/15 dark:text-[#6fdc84]">
                      {index + 1}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">Urgent payment problem?</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
                If money left your account but a booking still shows unpaid, file it as a <strong>Payment issue</strong>{' '}
                and include the M-Pesa message or PayWave reference. Do not pay twice.
              </p>
              <Link
                href="/contact"
                className="mt-3 inline-flex text-xs font-bold text-amber-900 underline underline-offset-2 hover:text-amber-950 dark:text-amber-200"
              >
                Or reach us on the contact page →
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
