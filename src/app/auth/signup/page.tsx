'use client'

import { useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState(searchParams.get('role') || 'hunter')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreeTerms) { setError('You must agree to the Terms & Conditions'); return }
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, full_name: name, phone, role, terms_accepted: true }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }

      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'signup' }),
      })

      setStep('otp')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== 6) { setError('Enter the full 6-digit code'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, type: 'signup' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }

      router.push('/auth/signin')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'signup' }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error)
    } catch {
      setError('Failed to resend')
    } finally {
      setResending(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...otp]
    next[index] = value
    setOtp(next)
    if (value && index < 5) otpRefs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const next = [...otp]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setOtp(next)
    const nextFocus = Math.min(text.length, 5)
    otpRefs.current[nextFocus]?.focus()
  }

  if (step === 'otp') {
    return (
      <div className="max-w-sm mx-auto px-4 py-16">
        <button onClick={() => setStep('form')} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Check Your Email</h1>
          <p className="text-gray-600 text-sm">
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>
        </div>

        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus={i === 0}
              />
            ))}
          </div>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Verify Email
          </Button>
        </form>

        <p className="text-center mt-4">
          <button onClick={handleResend} disabled={resending} className="text-sm text-blue-600 hover:underline disabled:opacity-50">
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-center mb-8">Create Account</h1>

      <form onSubmit={handleSignUp} className="space-y-4">
        <Input label="Full Name" id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Username" id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <Input label="Email" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Phone Number" id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">I want to...</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRole('hunter')} className={`p-3 rounded-xl border text-left transition-colors ${role === 'hunter' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-300 hover:border-gray-400'}`}>
              <span className="font-medium text-sm">Browse & Book</span>
              <p className="text-xs text-gray-500 mt-0.5">Find houses and book viewings</p>
            </button>
            <button type="button" onClick={() => setRole('lister')} className={`p-3 rounded-xl border text-left transition-colors ${role === 'lister' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-300 hover:border-gray-400'}`}>
              <span className="font-medium text-sm">List Houses</span>
              <p className="text-xs text-gray-500 mt-0.5">Upload and earn from listings</p>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-blue-600 rounded" />
          <span className="text-xs text-gray-600">
            I agree to the{' '}
            <Link href="/terms" target="_blank" className="text-blue-600 hover:underline">Terms for {role === 'lister' ? 'Listers' : 'House Hunters'}</Link>
            {' '}and consent to cookies being saved on my device for authentication purposes.
          </span>
        </label>

        <Button type="submit" loading={loading} className="w-full">
          Create Account
        </Button>
      </form>

      <p className="text-sm text-center text-gray-500 mt-6">
        Already have an account?{' '}
        <Link href="/auth/signin" className="text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>}>
      <SignUpForm />
    </Suspense>
  )
}
