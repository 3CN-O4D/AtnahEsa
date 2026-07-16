'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { KeyRound, Eye, EyeOff } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const [step, setStep] = useState<'otp' | 'password'>(email ? 'otp' : 'password')
  const [localEmail, setLocalEmail] = useState(email)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== 6) { setError('Enter the full 6-digit code'); return }
    setLoading(true); setError('')

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: localEmail, otp: code, type: 'password_reset' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
      setStep('password')
    } catch {
      setError('Something went wrong')
    } finally { setLoading(false) }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true); setError('')

    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: localEmail, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      router.push('/auth/signin')
    } catch {
      setError('Something went wrong')
    } finally { setLoading(false) }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...otp]; next[index] = value; setOtp(next)
    if (value && index < 5) otpRefs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus()
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const next = [...otp]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setOtp(next)
    otpRefs.current[Math.min(text.length, 5)]?.focus()
  }

  if (!email && step === 'otp') {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">No email provided.</p>
        <Link href="/auth/forgot-password" className="text-blue-600 hover:underline">Go to Forgot Password</Link>
      </div>
    )
  }

  if (step === 'otp') {
    return (
      <div className="max-w-sm mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Reset Password</h1>
          <p className="text-gray-600 text-sm">Enter the code sent to <strong>{localEmail}</strong></p>
        </div>
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input key={i} ref={(el) => { otpRefs.current[i] = el }} type="text" inputMode="numeric" maxLength={1} value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" autoFocus={i === 0} />
            ))}
          </div>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">Verify Code</Button>
        </form>
        <p className="text-center mt-4"><Link href="/auth/forgot-password" className="text-sm text-blue-600 hover:underline">Request a new code</Link></p>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
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
            <input id="password" type={showPassword ? 'text' : 'password'} placeholder="Min 6 characters" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">Confirm Password</label>
          <div className="relative">
            <input id="confirm" type={showConfirm ? 'text' : 'password'} placeholder="Repeat your password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Update Password</Button>
      </form>
      <p className="text-sm text-center mt-6"><Link href="/auth/signin" className="text-blue-600 hover:underline">Back to Sign In</Link></p>
    </div>
  )
}
