'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { AlertTriangle, ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import AuthShell from '@/components/auth/AuthShell'
import PasswordField from '@/components/auth/PasswordField'
import OtpInput, { emptyOtp } from '@/components/auth/OtpInput'
import { createClient } from '@/lib/supabase/client'
import { callbackDestination, withCallbackUrl } from '@/lib/auth-redirect'

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-4 py-14">
          <div className="rounded-[28px] border border-white/70 bg-white/85 p-8 shadow-xl">
            <div className="h-16 w-16 mx-auto mb-5 rounded-2xl bg-gray-100 animate-pulse" />
            <div className="h-7 w-40 mx-auto mb-8 rounded bg-gray-100 animate-pulse" />
            <div className="space-y-4">
              <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
              <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
              <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
            </div>
          </div>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  )
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = callbackDestination(searchParams.get('callbackUrl'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [codeSent, setCodeSent] = useState(false)
  const [otp, setOtp] = useState<string[]>(emptyOtp)
  const [sendingCode, setSendingCode] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [shakeSignal, setShakeSignal] = useState(0)
  const [error, setError] = useState(() =>
    searchParams.get('error') === 'auth_callback_failed'
      ? 'We could not complete that sign-in. Please try again.'
      : ''
  )

  const supabase = createClient()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.replace(callbackUrl)
        router.refresh()
      }
    })
    return () => subscription?.unsubscribe()
  }, [router, supabase.auth, callbackUrl])

  const fail = (message: string) => {
    setError(message)
    setShakeSignal((n) => n + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      fail('Enter your email address to continue')
      return
    }
    if (password.length < 6) {
      fail('Your password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })

      if (err) {
        fail(/invalid login credentials/i.test(err.message)
          ? 'Email or password is incorrect. Check both and try again.'
          : err.message)
      } else {
        router.replace(callbackUrl)
        router.refresh()
      }
    } catch {
      fail('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const sendLoginCode = async () => {
    if (!email.trim()) {
      fail('Enter your email address first')
      return
    }
    setSendingCode(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'login' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        fail(data.error || 'Could not send the code. Try again.')
        return
      }
      setCodeSent(true)
      setOtp(emptyOtp())
    } catch {
      fail('Network error. Check your connection and try again.')
    } finally {
      setSendingCode(false)
    }
  }

  const verifyLoginCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== 6) {
      fail('Enter the full 6-digit code')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/auth/otp-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        fail(data.error || 'Invalid or expired code')
        return
      }
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: data.token_hash,
      })
      if (verifyErr) {
        fail(verifyErr.message)
        return
      }
      router.replace(callbackUrl)
      router.refresh()
    } catch {
      fail('Something went wrong. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    // Carry the destination in a short-lived cookie: the OAuth redirect URL is
    // matched exactly against the Supabase allow-list, so we cannot append a
    // `next` query param to it reliably.
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `auth_next=${encodeURIComponent(callbackUrl)}; Path=/; Max-Age=600; SameSite=Lax${secure}`
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback` },
    })
    if (err) fail(err.message)
    setLoading(false)
  }

  const passwordError = error && /password|credential/i.test(error) ? error : undefined

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <div className="relative mx-auto mb-4 h-16 w-16">
          <span aria-hidden className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 to-blue-600 opacity-40 blur-lg animate-pulse-slow" />
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 shadow-lg ring-1 ring-white/40">
            <Image src="/images/asehanta-logo.jpeg" alt="AseHanta" fill sizes="64px" className="object-cover" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Welcome back</h1>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          Sign in to manage bookings, payments and listings.
        </p>
      </div>

      <div className="relative mb-6 grid grid-cols-2 rounded-xl bg-slate-100/90 p-1 dark:bg-slate-800/80">
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-spring dark:bg-slate-700 ${
            mode === 'code' ? 'translate-x-full' : 'translate-x-0'
          }`}
        />
        <button
          type="button"
          onClick={() => { setMode('password'); setError('') }}
          className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            mode === 'password' ? 'text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <LockKeyhole className="h-3.5 w-3.5" /> Password
        </button>
        <button
          type="button"
          onClick={() => { setMode('code'); setError('') }}
          className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            mode === 'code' ? 'text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <Mail className="h-3.5 w-3.5" /> Email code
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex animate-fadeInUp items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div key={mode} className="animate-fadeIn">
        {mode === 'password' ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              label="Email Address"
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
              autoComplete="email"
              required
            />

            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={(value) => { setPassword(value); if (error) setError('') }}
              placeholder="Enter your password"
              minLength={6}
              error={passwordError}
              invalid={Boolean(passwordError)}
              shakeSignal={passwordError ? shakeSignal : 0}
              autoComplete="current-password"
            />

            <div className="flex justify-end">
              <Link
                href={withCallbackUrl('/auth/forgot-password', callbackUrl)}
                className="text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 shadow-lg shadow-blue-600/20 hover:brightness-110"
            >
              Sign in <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyLoginCode} className="space-y-4">
            <Input
              label="Email Address"
              id="otp-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setCodeSent(false); if (error) setError('') }}
              autoComplete="email"
              required
            />

            {!codeSent ? (
              <Button type="button" onClick={sendLoginCode} loading={sendingCode} className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:brightness-110">
                <KeyRound className="mr-1.5 h-4 w-4" /> Email me a sign-in code
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Check your inbox</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
                  </p>
                </div>
                <OtpInput
                  value={otp}
                  onChange={(next) => { setOtp(next); if (error) setError('') }}
                  disabled={verifying}
                  invalid={Boolean(error)}
                  shakeSignal={shakeSignal}
                />
                <Button type="submit" loading={verifying} className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:brightness-110">
                  Verify &amp; sign in
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              {codeSent && (
                <button
                  type="button"
                  onClick={sendLoginCode}
                  disabled={sendingCode}
                  className="font-medium text-emerald-600 hover:underline disabled:opacity-60 dark:text-emerald-400"
                >
                  Resend code
                </button>
              )}
              <Link href={withCallbackUrl('/auth/forgot-password', callbackUrl)} className="ml-auto text-gray-500 hover:underline">
                Need help?
              </Link>
            </div>
          </form>
        )}
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 uppercase tracking-wider text-gray-400 dark:bg-slate-900">or continue with</span>
        </div>
      </div>

      <Button
        type="button"
        onClick={handleGoogleSignIn}
        loading={loading}
        className="w-full !bg-white !text-gray-700 border border-gray-300 hover:!bg-gray-50 dark:!bg-slate-800 dark:!text-gray-100 dark:border-gray-600"
      >
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </Button>

      <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-gray-400">
        <ShieldCheck className="h-3 w-3 text-emerald-500" />
        By continuing, you agree to our{' '}
        <Link href="/terms" target="_blank" className="text-emerald-600 hover:underline">Terms &amp; Conditions</Link>.
      </p>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
        New to AseHanta?{' '}
        <Link href={withCallbackUrl('/auth/signup', callbackUrl)} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}
