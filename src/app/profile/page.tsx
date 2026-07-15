'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, Lock, Mail, Phone, ArrowLeft } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }
      setUserEmail(user.email ?? '')
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data as Profile)
    })
  }, [router])

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

      // 1. Verify old password by trying to sign in
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPassword,
      })
      if (signInErr) {
        setError('Current password is incorrect')
        setLoading(false)
        return
      }

      // 2. Send OTP for reauthentication
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
    if (!otp) { setError('Enter the OTP sent to your email'); return }

    setLoading(true)

    try {
      const supabase = createClient()

      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: otp,
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
      setOtp('')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
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
      </div>

      {step === 'form' && (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5" /> Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input
              label="Current Password"
              id="old-password"
              type="password"
              placeholder="Enter current password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
            <Input
              label="New Password"
              id="new-password"
              type="password"
              placeholder="Min 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              label="Confirm New Password"
              id="confirm-password"
              type="password"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Send OTP
            </Button>
          </form>
        </div>
      )}

      {step === 'otp' && (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5" /> Verify OTP
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            A one-time password has been sent to <strong>{userEmail}</strong>. Enter it below to confirm the change.
          </p>
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <Input
              label="OTP"
              id="otp"
              type="text"
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Verify & Change Password
            </Button>
          </form>
        </div>
      )}

      {step === 'done' && success && (
        <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl p-4">{success}</p>
      )}
    </div>
  )
}