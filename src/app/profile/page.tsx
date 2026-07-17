'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, Lock, Mail, Phone, ArrowLeft, Eye, EyeOff, List } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [isGoogleUser, setIsGoogleUser] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form')
  const [oldPassword, setOldPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }
      setUserEmail(user.email ?? '')
      setIsGoogleUser(user.app_metadata?.provider === 'google')
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (error) { console.error('Profile fetch error:', error); router.push('/'); return }
      setProfile(data as Profile)
    })
  }, [router])

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) { setError(updateErr.message); setLoading(false); return }

      setStep('done')
      setSuccess('Password created successfully! You can now sign in with email and password.')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (!oldPassword) {
      setError('Enter your current password')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPassword,
      })
      if (signInErr) {
        setError('Current password is incorrect')
        setLoading(false)
        return
      }

      const { error: reauthErr } = await supabase.auth.reauthenticate()
      if (reauthErr) {
        setError(reauthErr.message)
        setLoading(false)
        return
      }

      setStep('otp')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const code = otp.join('')
    if (code.length !== 6) { setError('Enter the full 6-digit code'); return }

    setLoading(true)

    try {
      const supabase = createClient()

      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: code,
        type: 'email',
      })
      if (verifyErr) {
        setError(verifyErr.message)
        setLoading(false)
        return
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) {
        setError(updateErr.message)
        setLoading(false)
        return
      }

      setStep('done')
      setSuccess('Password changed successfully!')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setOtp(['', '', '', '', '', ''])
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
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

  if (!profile) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border rounded-xl p-6 space-y-4 mb-6">
        <h1 className="text-2xl font-bold">My Profile</h1>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{profile.full_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-400" />
            <span>{profile.username}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-gray-400" />
            <span>{profile.phone || 'No phone'}</span>
          </div>
          <div className="text-gray-500">
            Role: <span className="font-medium capitalize">{profile.role}</span>
          </div>
          <div className="text-gray-500">
            Joined: {new Date(profile.created_at).toLocaleDateString()}
          </div>
        </div>
        <Link href="/my-listings" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors">
          <List className="w-4 h-4" /> My Listings
        </Link>
      </div>

      {step === 'form' && isGoogleUser && (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5" /> Create Password
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            You signed in with Google. Set a password to also sign in with email and password.
          </p>
          <form onSubmit={handleCreatePassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">New Password</label>
              <div className="relative">
                <input id="new-password" type={showNew ? 'text' : 'password'} placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <div className="relative">
                <input id="confirm-password" type={showConfirm ? 'text' : 'password'} placeholder="Repeat password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">Create Password</Button>
          </form>
        </div>
      )}

      {step === 'form' && !isGoogleUser && (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5" /> Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="old-password" className="block text-sm font-medium text-gray-700">Current Password</label>
              <div className="relative">
                <input id="old-password" type={showOld ? 'text' : 'password'} placeholder="Enter current password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">New Password</label>
              <div className="relative">
                <input id="new-password" type={showNew ? 'text' : 'password'} placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
              <div className="relative">
                <input id="confirm-password" type={showConfirm ? 'text' : 'password'} placeholder="Repeat new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">Send OTP</Button>
          </form>
        </div>
      )}

      {step === 'otp' && (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5" /> Verify OTP
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            A code has been sent to <strong>{userEmail}</strong>.
          </p>
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
            <Button type="submit" loading={loading} className="w-full">Verify & Change Password</Button>
          </form>
        </div>
      )}

      {step === 'done' && success && (
        <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl p-4">{success}</p>
      )}
    </div>
  )
}
