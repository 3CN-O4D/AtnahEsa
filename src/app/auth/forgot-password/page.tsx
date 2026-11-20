'use client'

import { Suspense, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, KeyRound, Eye, EyeOff } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { callbackDestination, withCallbackUrl } from '@/lib/auth-redirect'

function ForgotPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = callbackDestination(searchParams.get('callbackUrl'))
  const [step, setStep] = useState<'email' | 'otp' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email')
  const [resolvedEmail, setResolvedEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [sendCooldown, setSendCooldown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sendCooldown > 0) return
    setLoading(true)
    setError('')

    try {
      const identifier = channel === 'whatsapp' ? phone.trim() : email.trim()
      if (!identifier) {
        setError(channel === 'whatsapp' ? 'Enter your WhatsApp number' : 'Enter your email address')
        setLoading(false)
        return
      }
      const body = channel === 'whatsapp'
        ? { phone: identifier, type: 'password_reset' }
        : { email: identifier, type: 'password_reset' }
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          setError('Too many reset code requests. Please wait a minute before trying again.')
        } else {
          setError(data.error)
        }
        return
      }
      if (!data.emailSent && !data.email) {
        setError('Could not send reset code. Please check your details and try again.')
        return
      }
      // Phone-first codes are stored under the account email; remember it so
      // verification can look the code up.
      if (data.email) setResolvedEmail(data.email)
      setStep('otp')
      // Start 60-second cooldown before allowing resend
      let seconds = 60
      setResendCooldown(seconds)
      const timer = setInterval(() => {
        seconds -= 1
        setResendCooldown(seconds)
        if (seconds <= 0) clearInterval(timer)
      }, 1000)
      // 30-second cooldown before sending another code
      let sendSeconds = 30
      setSendCooldown(sendSeconds)
      const sendTimer = setInterval(() => {
        sendSeconds -= 1
        setSendCooldown(sendSeconds)
        if (sendSeconds <= 0) clearInterval(sendTimer)
      }, 1000)
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
      const accountEmail = resolvedEmail || email.trim()
      if (!accountEmail) { setError('We could not identify your account. Try requesting a new code.'); setLoading(false); return }
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountEmail, otp: code, type: 'password_reset' }),
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
      const accountEmail = resolvedEmail || email.trim()
      if (!accountEmail) { setError('We could not identify your account. Try requesting a new code.'); setLoading(false); return }
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountEmail, password, otp: code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      router.push(withCallbackUrl('/auth/signin', callbackUrl))
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
      const identifier = channel === 'whatsapp' ? phone.trim() : email.trim()
      if (!identifier) { setError('Enter your ' + (channel === 'whatsapp' ? 'WhatsApp number' : 'email address')); setResending(false); return }
      const body = channel === 'whatsapp'
        ? { phone: identifier, type: 'password_reset' }
        : { email: identifier, type: 'password_reset' }
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          setError('Too many reset code requests. Please wait a minute before trying again.')
        } else {
          setError(data.error)
        }
        return
      }
      if (data.email) setResolvedEmail(data.email)
      // Restart cooldown
      let seconds = 60
      setResendCooldown(seconds)
      const timer = setInterval(() => {
        seconds -= 1
        setResendCooldown(seconds)
        if (seconds <= 0) clearInterval(timer)
      }, 1000)
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
            Enter the code sent to <strong>{channel === 'whatsapp' ? phone.trim() : email.trim()}</strong>
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
            {resendCooldown > 0 ? (
              <button disabled className="text-sm text-gray-400 cursor-not-allowed">
                Resend code ({resendCooldown}s)
              </button>
            ) : (
              <button onClick={handleResend} disabled={resending} className="text-sm text-blue-600 hover:underline disabled:opacity-50">
                {resending ? 'Sending...' : 'Resend code'}
              </button>
            )}
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
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-blue-700" />
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
        We&apos;ll send a reset code to your email or WhatsApp.
      </p>

      <form onSubmit={handleSendOtp} className="space-y-4">
        <div className="relative mb-1 grid grid-cols-2 rounded-xl bg-slate-100/90 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => { setChannel('email'); setError('') }}
            className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              channel === 'email' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <Mail className="h-3.5 w-3.5" /> Email
          </button>
          <button
            type="button"
            onClick={() => { setChannel('whatsapp'); setError('') }}
            className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              channel === 'whatsapp' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 15.06L2 22l5.06-1.52A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.17 8.17 0 0 1-4.16-1.14l-.3-.18-3 .9.9-2.93-.2-.31a8.2 8.2 0 1 1 6.76 3.66Zm4.5-6.13c-.25-.12-1.47-.72-1.7-.81-.22-.08-.39-.12-.55.13-.16.24-.63.8-.77.97-.14.16-.28.18-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.48-1.38-1.73-.14-.25-.02-.38.11-.5.11-.12.25-.28.37-.42.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.25-.84.82-.84 2 .01 1.18.86 2.31.98 2.47.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.5.57.19 1.1.16 1.51.1.46-.07 1.4-.57 1.6-1.13.2-.55.2-1.03.14-1.13-.06-.1-.22-.16-.47-.28Z"/></svg> WhatsApp
          </button>
        </div>

        {channel === 'email' ? (
          <Input
            label="Email Address"
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        ) : (
          <Input
            label="WhatsApp Number"
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="e.g. 0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" loading={loading} disabled={sendCooldown > 0 || resendCooldown > 0 || loading} className="w-full">
          {sendCooldown > 0 ? `Send code again (${sendCooldown}s)` : resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Send Reset Code'}
        </Button>
      </form>

      <p className="text-sm text-center mt-6">
        <Link href={withCallbackUrl('/auth/signin', callbackUrl)} className="text-blue-600 hover:underline">
          Back to Sign In
        </Link>
      </p>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-sm mx-auto px-4 py-16">
          <div className="h-8 w-48 mx-auto mb-8 rounded bg-gray-100 animate-pulse" />
          <div className="h-11 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  )
}
