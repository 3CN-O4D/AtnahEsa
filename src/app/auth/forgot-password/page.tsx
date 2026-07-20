'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, KeyRound, Eye, EyeOff } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'otp' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'password_reset' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
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
        body: JSON.stringify({ email, otp: code, type: 'password_reset' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setStep('password')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }

    setLoading(true)
    setError('')

    try {
      const code = otp.join('')
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, otp: code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
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
        body: JSON.stringify({ email, type: 'password_reset' }),
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
        <button onClick={() => setStep('email')} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Reset Password</h1>
          <p className="text-gray-600 text-sm">
            Enter the code sent to <strong>{email}</strong>
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
            Verify Code
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

  if (step === 'password') {
    return (
      <div className="max-w-sm mx-auto px-4 py-16">
        <button onClick={() => setStep('otp')} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Set New Password</h1>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">New Password</label>
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
          <div className="space-y-1">
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">Confirm Password</label>
            <div className="relative">
              <input
                id="confirm"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Update Password
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-center mb-2">Forgot Password</h1>
      <p className="text-gray-500 text-sm text-center mb-8">
        Enter your email and we&apos;ll send a reset code.
      </p>

      <form onSubmit={handleSendOtp} className="space-y-4">
        <Input
          label="Email Address"
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Send Reset Code
        </Button>
      </form>

      <p className="text-sm text-center mt-6">
        <Link href="/auth/signin" className="text-blue-600 hover:underline">
          Back to Sign In
        </Link>
      </p>
    </div>
  )
}
