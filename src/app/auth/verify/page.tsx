'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

export default function VerifyPage() {
  const router = useRouter()
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  const identifier = typeof window !== 'undefined' ? sessionStorage.getItem('authIdentifier') : null
  const method = typeof window !== 'undefined' ? sessionStorage.getItem('authMethod') : null

  useEffect(() => {
    if (!identifier) router.push('/auth/signin')
  }, [identifier, router])

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const token = otp.join('')

      let err
      if (method === 'phone') {
        const res = await supabase.auth.verifyOtp({
          phone: identifier!,
          token,
          type: 'sms',
        })
        err = res.error
      } else {
        const res = await supabase.auth.verifyOtp({
          email: identifier!,
          token,
          type: 'email',
        })
        err = res.error
      }

      if (err) {
        setError(err.message)
      } else {
        sessionStorage.removeItem('authIdentifier')
        sessionStorage.removeItem('authMethod')
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!identifier) return
    const supabase = createClient()
    if (method === 'phone') {
      await supabase.auth.signInWithOtp({ phone: identifier })
    } else {
      await supabase.auth.signInWithOtp({ email: identifier })
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-2">Verify OTP</h1>
      <p className="text-gray-600 text-sm mb-8">
        Enter the code sent to {identifier}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-center gap-2">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el }}
              type="text"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Verify
        </Button>
      </form>

      <button
        onClick={handleResend}
        className="text-sm text-blue-600 hover:underline mt-4"
      >
        Resend code
      </button>
    </div>
  )
}
