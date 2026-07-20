'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { User, Lock, Mail, Phone, ArrowLeft, Eye, EyeOff, List, Camera, X, Check } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [isGoogleUser, setIsGoogleUser] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editing, setEditing] = useState({ full_name: '', username: '', phone: '' })
  const [avatarUploading, setAvatarUploading] = useState(false)

  // OTP for profile changes
  const [profileOtpSent, setProfileOtpSent] = useState(false)
  const [profileOtp, setProfileOtp] = useState(['', '', '', '', '', ''])
  const [profileOtpLoading, setProfileOtpLoading] = useState(false)

  // Password change
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form')
  const [oldPassword, setOldPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordOtp, setPasswordOtp] = useState(['', '', '', '', '', ''])
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const profileOtpRefs = useRef<(HTMLInputElement | null)[]>([])
  const passwordOtpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }
      setUserEmail(user.email ?? '')
      const hasEmailIdentity = user.identities?.some((i) => i.provider === 'email')
      setIsGoogleUser(user.app_metadata?.provider === 'google' && !hasEmailIdentity)
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (error) { console.error('Profile fetch error:', error); setError('Failed to load profile: ' + error.message); setProfileLoaded(true); return }
      const p = data as Profile
      setProfile(p)
      setEditing({ full_name: p.full_name, username: p.username, phone: p.phone || '' })
      setProfileLoaded(true)
    })
  }, [router])

  const startEdit = () => {
    if (!profile) return
    setEditing({ full_name: profile.full_name, username: profile.username, phone: profile.phone || '' })
    setProfileOtpSent(false)
    setProfileOtp(['', '', '', '', '', ''])
    setError('')
    setSuccess('')
    setEditMode(true)
  }

  const cancelEdit = () => {
    if (!profile) return
    setEditing({ full_name: profile.full_name, username: profile.username, phone: profile.phone || '' })
    setProfileOtpSent(false)
    setProfileOtp(['', '', '', '', '', ''])
    setError('')
    setEditMode(false)
  }

  const handleSendProfileOtp = async () => {
    setError('')
    setSuccess('')
    if (!editing.full_name.trim() || !editing.username.trim()) {
      setError('Name and username are required')
      return
    }

    setProfileOtpLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, type: 'profile_update' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setProfileOtpLoading(false); return }
      setProfileOtpSent(true)
      setTimeout(() => profileOtpRefs.current[0]?.focus(), 100)
    } catch {
      setError('Failed to send OTP')
    } finally {
      setProfileOtpLoading(false)
    }
  }

  const handleVerifyProfileOtp = async () => {
    setError('')
    setSuccess('')
    const code = profileOtp.join('')
    if (code.length !== 6) { setError('Enter the full 6-digit code'); return }

    setProfileOtpLoading(true)
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editing, otp: code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setProfileOtpLoading(false); return }

      const supabase = createClient()
      const { data: fresh } = await supabase.from('profiles').select('*').eq('id', profile!.id).maybeSingle()
      if (fresh) {
        setProfile(fresh as Profile)
        setEditing({ full_name: fresh.full_name, username: fresh.username, phone: fresh.phone || '' })
      }
      setEditMode(false)
      setProfileOtpSent(false)
      setProfileOtp(['', '', '', '', '', ''])
      setSuccess('Profile updated successfully!')
    } catch {
      setError('Something went wrong')
    } finally {
      setProfileOtpLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string, arr: string[], set: (v: string[]) => void) => {
    if (!/^\d?$/.test(value)) return
    const next = [...arr]
    next[index] = value
    set(next)
    if (value && index < 5) {
      const refs = arr === profileOtp ? profileOtpRefs : passwordOtpRefs
      refs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent, arr: string[], set: (v: string[]) => void) => {
    if (e.key === 'Backspace' && !arr[index] && index > 0) {
      const refs = arr === profileOtp ? profileOtpRefs : passwordOtpRefs
      refs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent, arr: string[], set: (v: string[]) => void) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const next = [...arr]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    set(next)
    const nextFocus = Math.min(text.length, 5)
    const refs = arr === profileOtp ? profileOtpRefs : passwordOtpRefs
    refs.current[nextFocus]?.focus()
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    setError('')
    setSuccess('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload-avatar', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setAvatarUploading(false); return }

      const supabase = createClient()
      const { data: fresh } = await supabase.from('profiles').select('*').eq('id', profile!.id).maybeSingle()
      if (fresh) setProfile(fresh as Profile)
      setSuccess('Profile picture updated!')
    } catch {
      setError('Upload failed')
    } finally {
      setAvatarUploading(false)
    }
  }

  // Password change handlers (unchanged logic)
  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) { setError(updateErr.message); setLoading(false); return }
      setStep('done')
      setSuccess('Password created successfully!')
      setNewPassword(''); setConfirmPassword('')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (!oldPassword) { setError('Enter your current password'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: userEmail, password: oldPassword })
      if (signInErr) { setError('Current password is incorrect'); setLoading(false); return }
      const { error: reauthErr } = await supabase.auth.reauthenticate()
      if (reauthErr) { setError(reauthErr.message); setLoading(false); return }
      setStep('otp')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyPasswordOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    const code = passwordOtp.join('')
    if (code.length !== 6) { setError('Enter the full 6-digit code'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: verifyErr } = await supabase.auth.verifyOtp({ email: userEmail, token: code, type: 'email' })
      if (verifyErr) { setError(verifyErr.message); setLoading(false); return }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) { setError(updateErr.message); setLoading(false); return }
      setStep('done')
      setSuccess('Password changed successfully!')
      setOldPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordOtp(['', '', '', '', '', ''])
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!profileLoaded) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading profile...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4">{error}</p>}
        {!error && <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Profile not found. Try signing out and back in.</p>}
        <button onClick={() => { const s = createClient(); s.auth.signOut() }} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Sign Out</button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {success && (
        <p className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-4">{success}</p>
      )}

      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 space-y-4 mb-6">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold dark:text-white">My Profile</h1>
          {!editMode && (
            <button onClick={startEdit} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
          )}
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <User className="w-7 h-7 text-blue-600 dark:text-blue-300" />
              </div>
            )}
            {editMode && (
              <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors">
                <Camera className="w-3.5 h-3.5" />
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={avatarUploading} />
              </label>
            )}
          </div>
          {avatarUploading && <p className="text-sm text-gray-500 dark:text-gray-400">Uploading...</p>}
        </div>

        {/* Fields */}
        {editMode ? (
          <div className="space-y-3">
            <Input label="Full Name" id="edit-name" value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
            <Input label="Username" id="edit-username" value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} />
            <Input label="Phone Number" id="edit-phone" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {!profileOtpSent ? (
              <div className="flex gap-2">
                <Button onClick={cancelEdit} variant="outline" className="flex-1">Cancel</Button>
                <Button onClick={handleSendProfileOtp} loading={profileOtpLoading} className="flex-1">
                  <Check className="w-4 h-4 mr-1" /> Save Changes
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  A code has been sent to <strong className="dark:text-white">{userEmail}</strong>.
                </p>
                <div className="flex justify-center gap-2" onPaste={(e) => handleOtpPaste(e, profileOtp, setProfileOtp)}>
                  {profileOtp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { profileOtpRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value, profileOtp, setProfileOtp)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e, profileOtp, setProfileOtp)}
                      className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => { setProfileOtpSent(false); setProfileOtp(['', '', '', '', '', '']) }} variant="outline" className="flex-1">Back</Button>
                  <Button onClick={handleVerifyProfileOtp} loading={profileOtpLoading} className="flex-1">Confirm</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium dark:text-white">{profile.full_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="dark:text-gray-200">{profile.username}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-400" />
              <span className="dark:text-gray-200">{profile.phone || 'No phone'}</span>
            </div>
            <div className="text-gray-500 dark:text-gray-400">
              Role: <span className="font-medium capitalize dark:text-gray-200">{profile.role}</span>
            </div>
            <div className="text-gray-500 dark:text-gray-400">
              Joined: {new Date(profile.created_at).toLocaleDateString()}
            </div>
          </div>
        )}

        <Link href="/my-listings" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
          <List className="w-4 h-4" /> My Listings
        </Link>
      </div>

      {/* Password Section */}
      {step === 'form' && isGoogleUser && !editMode && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5" /> Create Password
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            You signed in with Google. Set a password to also sign in with email and password.
          </p>
          <form onSubmit={handleCreatePassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
              <div className="relative">
                <input id="new-password" type={showNew ? 'text' : 'password'} placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
              <div className="relative">
                <input id="confirm-password" type={showConfirm ? 'text' : 'password'} placeholder="Repeat password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">Create Password</Button>
          </form>
        </div>
      )}

      {step === 'form' && !isGoogleUser && !editMode && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5" /> Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="old-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Current Password</label>
              <div className="relative">
                <input id="old-password" type={showOld ? 'text' : 'password'} placeholder="Enter current password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
              <div className="relative">
                <input id="new-password" type={showNew ? 'text' : 'password'} placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
              <div className="relative">
                <input id="confirm-password" type={showConfirm ? 'text' : 'password'} placeholder="Repeat new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">Send OTP</Button>
          </form>
        </div>
      )}

      {step === 'otp' && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5" /> Verify OTP
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            A code has been sent to <strong className="dark:text-white">{userEmail}</strong>.
          </p>
          <form onSubmit={handleVerifyPasswordOtp} className="space-y-6">
            <div className="flex justify-center gap-2" onPaste={(e) => handleOtpPaste(e, passwordOtp, setPasswordOtp)}>
              {passwordOtp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { passwordOtpRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value, passwordOtp, setPasswordOtp)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e, passwordOtp, setPasswordOtp)}
                  className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">Verify & Change Password</Button>
          </form>
        </div>
      )}

      {step === 'done' && success && (
        <p className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4">{success}</p>
      )}
    </div>
  )
}
