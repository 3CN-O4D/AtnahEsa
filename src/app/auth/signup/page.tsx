'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Home,
  MailCheck,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import AuthShell from '@/components/auth/AuthShell'
import PasswordField from '@/components/auth/PasswordField'
import OtpInput, { emptyOtp } from '@/components/auth/OtpInput'
import { useShake } from '@/components/auth/useShake'
import { callbackDestination, withCallbackUrl } from '@/lib/auth-redirect'

const RESEND_SECONDS = 45

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = callbackDestination(searchParams.get('callbackUrl'))
  const [role, setRole] = useState(() => searchParams.get('role') || 'hunter')
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState<string[]>(emptyOtp)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [shakeSignal, setShakeSignal] = useState(0)
  const [resendIn, setResendIn] = useState(0)
  const shaking = useShake(shakeSignal)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setInterval(() => setResendIn((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [resendIn])

  const fail = (message: string) => {
    setError(message)
    setShakeSignal((n) => n + 1)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    const missing: string[] = []
    if (!name.trim()) missing.push('your full name')
    if (!username.trim()) missing.push('a username')
    if (!email.trim()) missing.push('your email')
    if (!phone.trim()) missing.push('your phone number')
    if (missing.length) {
      fail(`Please add ${missing.join(', ')}`)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fail('That email address does not look right')
      return
    }
    if (!agreeTerms) {
      fail('Please agree to the Terms & Conditions to continue')
      return
    }
    if (password.length < 6) {
      fail('Your password must be at least 6 characters')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, full_name: name, phone, role, terms_accepted: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        fail(data.error || 'Could not create your account. Check your details and try again.')
        return
      }

      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'signup' }),
      })

      setStep('otp')
      setResendIn(RESEND_SECONDS)
      setOtp(emptyOtp())
    } catch {
      fail('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== 6) {
      fail('Enter the full 6-digit code')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, type: 'signup' }),
      })
      const data = await res.json()
      if (!res.ok) {
        fail(data.error || 'That code is not valid. Check the email and try again.')
        return
      }

      router.push(withCallbackUrl('/auth/signin', callbackUrl))
    } catch {
      fail('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendIn > 0) return
    setResending(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'signup' }),
      })
      const data = await res.json()
      if (!res.ok) {
        fail(data.error || 'Could not resend the code')
        return
      }
      setOtp(emptyOtp())
      setResendIn(RESEND_SECONDS)
    } catch {
      fail('Failed to resend. Try again in a moment.')
    } finally {
      setResending(false)
    }
  }

  const backToForm = () => {
    setStep('form')
    setError('')
    setOtp(emptyOtp())
  }

  if (step === 'otp') {
    return (
      <AuthShell>
        <div className="animate-fadeIn">
          <button
            onClick={backToForm}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to details
          </button>

          <div className="mb-6 text-center">
            <div className="relative mx-auto mb-4 h-16 w-16">
              <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30 motion-reduce:animate-none" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 shadow-lg shadow-emerald-600/20 ring-1 ring-white/40">
                <MailCheck className="h-7 w-7 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Check your email</h1>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-gray-500 dark:text-gray-400">
              We sent a 6-digit code to <strong className="text-gray-700 dark:text-gray-200">{email}</strong>. It expires in 10 minutes.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className={`mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 ${shaking ? 'animate-authShake' : 'animate-fadeInUp'}`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <OtpInput
              value={otp}
              onChange={(next) => { setOtp(next); if (error) setError('') }}
              disabled={loading}
              invalid={Boolean(error)}
              shakeSignal={shakeSignal}
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 shadow-lg shadow-blue-600/20 hover:brightness-110"
            >
              Verify &amp; create account <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-5 text-center text-xs text-gray-500 dark:text-gray-400">
            Didn&apos;t get it?{' '}
            <button
              onClick={handleResend}
              disabled={resending || resendIn > 0}
              className="font-semibold text-emerald-600 transition-colors hover:underline disabled:cursor-not-allowed disabled:text-gray-400 dark:text-emerald-400"
            >
              {resending ? 'Sending…' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Wrong address? <button onClick={backToForm} className="text-emerald-600 hover:underline">Edit your details</button>
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <div className="relative mx-auto mb-4 h-16 w-16">
          <span aria-hidden className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 to-blue-600 opacity-40 blur-lg animate-pulse-slow" />
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 shadow-lg ring-1 ring-white/40">
            <Image src="/images/asehanta-logo.jpeg" alt="AseHanta" fill sizes="64px" className="object-cover" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Create your account</h1>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          Two minutes and you&apos;re in. No hidden charges.
        </p>
      </div>

      {/* Step rail */}
      <ol className="mb-6 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
        <li className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white shadow-sm">1</span>
          Details
        </li>
        <li aria-hidden className="h-px w-8 bg-gradient-to-r from-emerald-400 to-gray-200 dark:to-gray-700" />
        <li className="inline-flex items-center gap-1.5 text-gray-400">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[10px] dark:border-gray-600">2</span>
          Verify
        </li>
      </ol>

      {error && (
        <div
          role="alert"
          className={`mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 ${shaking ? 'animate-authShake' : 'animate-fadeInUp'}`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSignUp} noValidate className="space-y-4">
        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" /> I&apos;m here to…
          </legend>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { value: 'hunter', title: 'Browse & book', copy: 'Find a home', Icon: Home },
              { value: 'lister', title: 'List my house', copy: 'Earn from listings', Icon: Building2 },
            ].map(({ value, title, copy, Icon }) => {
              const selected = role === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRole(value)}
                  aria-pressed={selected}
                  className={`group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.98] ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50/80 shadow-sm shadow-emerald-600/10 ring-1 ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-950/30'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-slate-800/60 dark:hover:border-gray-500'
                  }`}
                >
                  <span
                    className={`absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full transition-all duration-200 ${
                      selected ? 'scale-100 bg-emerald-500 text-white' : 'scale-0 bg-transparent'
                    }`}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <Icon className={`h-5 w-5 transition-transform duration-300 group-hover:scale-110 ${selected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`} />
                  <p className={`mt-2 text-sm font-semibold ${selected ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-800 dark:text-gray-100'}`}>{title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy}</p>
                </button>
              )
            })}
          </div>
        </fieldset>

        <Input
          label="Full name"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Wanjiku"
          autoComplete="name"
          required
        />
        <Input
          label="Username"
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="jane_w"
          autoComplete="username"
          required
        />
        <Input
          label="Email address"
          id="email"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <Input
          label="Phone number"
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+254 7XX XXX XXX"
          autoComplete="tel"
          required
        />

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={(value) => { setPassword(value); if (error) setError('') }}
          placeholder="At least 6 characters"
          minLength={6}
          showStrength
          invalid={Boolean(error) && /password/i.test(error)}
          shakeSignal={/password/i.test(error) ? shakeSignal : 0}
          autoComplete="new-password"
        />

        <label className="group flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3 transition-colors hover:border-emerald-300 has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50/70 dark:border-gray-700 dark:bg-slate-800/50 dark:has-[:checked]:border-emerald-700 dark:has-[:checked]:bg-emerald-950/20">
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => { setAgreeTerms(e.target.checked); if (error) setError('') }}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-emerald-600"
          />
          <span className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            I agree to the{' '}
            <Link href="/terms" target="_blank" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              Terms for {role === 'lister' ? 'Listers' : 'House Hunters'}
            </Link>{' '}
            and consent to cookies being saved on my device for authentication.
          </span>
        </label>

        <Button
          type="submit"
          loading={loading}
          className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 shadow-lg shadow-blue-600/20 hover:brightness-110"
        >
          <UserRound className="mr-1.5 h-4 w-4" /> Create account
        </Button>
      </form>

      <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-gray-400">
        <ShieldCheck className="h-3 w-3 text-emerald-500" />
        Your details stay private. Hunters are never shown publicly on a booked house.
      </p>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Already have an account?{' '}
        <Link href={withCallbackUrl('/auth/signin', callbackUrl)} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-14">
          <div className="rounded-[28px] border border-white/70 bg-white/85 p-8 shadow-xl">
            <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-gray-100 animate-pulse" />
            <div className="mx-auto mb-8 h-7 w-44 rounded bg-gray-100 animate-pulse" />
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  )
}
