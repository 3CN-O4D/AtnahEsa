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
  const [hasPassword, setHasPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editing, setEditing] = useState({ full_name: '', username: '', phone: '' })
  const [avatarUploading, setAvatarUploading] = useState(false)

  // OTP for profile changes
  const [profileOtpSent, setProfileOtpSent] = useState(false)
  const [profileOtp, setProfileOtp] = useState(['', '', '', '', '', ''])
  const [profileOtpLoading, setProfileOtpLoading] = useState(false)

  // Email change
  const [emailStep, setEmailStep] = useState<'idle' | 'otp' | 'done'>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [emailOtp, setEmailOtp] = useState(['', '', '', '', '', ''])
  const [emailOtpLoading, setEmailOtpLoading] = useState(false)
  const emailOtpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Password change
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form')
  const [oldPassword, setOldPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordOtp, setPasswordOtp] = useState(['', '', '', '', '', ''])

  // Create password (Google users - needs OTP)
  const [createStep, setCreateStep] = useState<'form' | 'otp' | 'done'>('form')
  const [createOtp, setCreateOtp] = useState(['', '', '', '', '', ''])
  const [createOtpLoading, setCreateOtpLoading] = useState(false)
  const createOtpRefs = useRef<(HTMLInputElement | null)[]>([])
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const profileOtpRefs = useRef<(HTMLInputElement | null)[]>([])
  const passwordOtpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin'); return }
      setUserEmail(user.email ?? '')
      const isGoogle = user.app_metadata?.provider === 'google'
      setIsGoogleUser(isGoogle)
      const { data: existing } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (existing) {
        const p = existing as Profile & { has_password?: boolean }
        setProfile(p)
        setHasPassword(!!p.has_password)
        setEditing({ full_name: p.full_name, username: p.username, phone: p.phone || '' })
      } else {
        const meta = user.user_metadata || {}
        const defaultUsername = meta.preferred_username || meta.username || user.email?.split('@')[0] || 'user'
        const { data: created, error: createError } = await supabase
          .from('profiles')
          .insert({ id: user.id, full_name: meta.full_name || meta.name || user.email?.split('@')[0] || 'User', username: defaultUsername, phone: meta.phone || '', role: meta.role || 'hunter', terms_accepted: true, has_password: !isGoogle })
          .select()
          .single()
        if (createError || !created) {
          console.error('Profile create error:', createError)
          setError('Failed to create profile. Please contact support.')
          setProfileLoaded(true)
          return
        }
        const p = created as Profile & { has_password?: boolean }
        setProfile(p)
        setHasPassword(!!p.has_password)
        setEditing({ full_name: p.full_name, username: p.username, phone: p.phone || '' })
      }
      setProfileLoaded(true)
    }).catch((err) => {
      console.error('Profile load error:', err)
      setError('Failed to load profile')
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

  // Email change handlers
  const handleSendEmailOtp = async () => {
    setError(''); setSuccess('')
    if (!newEmail.trim()) { setError('Enter a new email address'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setError('Invalid email address'); return }
    if (newEmail === userEmail) { setError('New email is the same as current email'); return }
    setEmailOtpLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, type: 'email_change' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setEmailOtpLoading(false); return }
      setEmailStep('otp')
      setTimeout(() => emailOtpRefs.current[0]?.focus(), 100)
    } catch {
      setError('Failed to send OTP')
    } finally {
      setEmailOtpLoading(false)
    }
  }

  const handleVerifyEmailOtp = async () => {
    setError(''); setSuccess('')
    const code = emailOtp.join('')
    if (code.length !== 6) { setError('Enter the full 6-digit code'); return }
    setEmailOtpLoading(true)
    try {
      const res = await fetch('/api/profile/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_email: newEmail, otp: code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setEmailOtpLoading(false); return }
      setUserEmail(newEmail)
      setNewEmail('')
      setEmailStep('done')
      setSuccess('Email address updated successfully!')
    } catch {
      setError('Something went wrong')
    } finally {
      setEmailOtpLoading(false)
    }
  }

  const handleEmailOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...emailOtp]
    next[index] = value
    setEmailOtp(next)
    if (value && index < 5) emailOtpRefs.current[index + 1]?.focus()
  }

  const handleEmailOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !emailOtp[index] && index > 0) {
      emailOtpRefs.current[index - 1]?.focus()
    }
  }

  const handleEmailOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const next = [...emailOtp]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setEmailOtp(next)
    emailOtpRefs.current[Math.min(text.length, 5)]?.focus()
  }

  // Generic resend OTP handler with cooldown
  const startCooldown = () => {
    setResendCooldown(60)
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleResendOtp = async (email: string, type: string) => {
    if (resendCooldown > 0) return
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      startCooldown()
    } catch {
      setError('Failed to resend code')
    }
  }

  // Create password handlers (Google users - OTP verified)
  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, type: 'password_create' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
      setCreateStep('otp')
      setTimeout(() => createOtpRefs.current[0]?.focus(), 100)
    } catch {
      setError('Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCreateOtp = async () => {
    setError(''); setSuccess('')
    const code = createOtp.join('')
    if (code.length !== 6) { setError('Enter the full 6-digit code'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, password: newPassword, otp: code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
      const supabase = createClient()
      await supabase.from('profiles').update({ has_password: true }).eq('id', profile!.id)
      setHasPassword(true)
      setCreateStep('done')
      setSuccess('Password created successfully!')
      setNewPassword(''); setConfirmPassword(''); setCreateOtp(['', '', '', '', '', ''])
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...createOtp]
    next[index] = value
    setCreateOtp(next)
    if (value && index < 5) createOtpRefs.current[index + 1]?.focus()
  }

  const handleCreateOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !createOtp[index] && index > 0) {
      createOtpRefs.current[index - 1]?.focus()
    }
  }

  const handleCreateOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const next = [...createOtp]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setCreateOtp(next)
    createOtpRefs.current[Math.min(text.length, 5)]?.focus()
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
      await supabase.from('profiles').update({ has_password: true }).eq('id', profile!.id)
      setHasPassword(true)
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
        <p className="text-gray-500 text-sm">Loading profile...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4">{error}</p>}
        {!error && <p className="text-gray-500 text-sm mb-4">Profile not found. Try signing out and back in.</p>}
        <button onClick={() => { const s = createClient(); s.auth.signOut() }} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Sign Out</button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:hover:text-white mb-6">
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
          {avatarUploading && <p className="text-sm text-gray-500">Uploading...</p>}
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
                <p className="text-sm text-gray-600">
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
                <button type="button" onClick={() => handleResendOtp(userEmail, 'profile_update')} disabled={resendCooldown > 0} className="w-full text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed">
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </button>
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
        )}

        <Link href="/my-listings" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
          <List className="w-4 h-4" /> My Listings
        </Link>
      </div>

      {/* Password Section */}
      {createStep === 'form' && isGoogleUser && !hasPassword && !editMode && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5" /> Create Password
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            You signed in with Google. Set a password to also sign in with email and password. We&apos;ll send a verification code to your email first.
          </p>
          <form onSubmit={handleCreatePassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">New Password</label>
              <div className="relative">
                <input id="new-password" type={showNew ? 'text' : 'password'} placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <div className="relative">
                <input id="confirm-password" type={showConfirm ? 'text' : 'password'} placeholder="Repeat password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">Send Verification Code</Button>
          </form>
        </div>
      )}

      {createStep === 'otp' && isGoogleUser && !hasPassword && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5" /> Verify Code
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Enter the 6-digit code sent to <strong className="dark:text-white">{userEmail}</strong>.
          </p>
          <div className="space-y-4">
            <div className="flex justify-center gap-2" onPaste={handleCreateOtpPaste}>
              {createOtp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { createOtpRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCreateOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleCreateOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={() => { setCreateStep('form'); setCreateOtp(['', '', '', '', '', '']); setError('') }} variant="outline" className="flex-1">Back</Button>
              <Button onClick={handleVerifyCreateOtp} loading={loading} className="flex-1">Verify & Create</Button>
            </div>
            <button type="button" onClick={() => handleResendOtp(userEmail, 'password_create')} disabled={resendCooldown > 0} className="w-full text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed">
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}

      {step === 'form' && !(isGoogleUser && !hasPassword) && !editMode && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5" /> Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="old-password" className="block text-sm font-medium text-gray-700">Current Password</label>
              <div className="relative">
                <input id="old-password" type={showOld ? 'text' : 'password'} placeholder="Enter current password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">New Password</label>
              <div className="relative">
                <input id="new-password" type={showNew ? 'text' : 'password'} placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
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
            <button type="button" onClick={async () => {
              if (resendCooldown > 0) return
              setError('')
              try {
                const supabase = createClient()
                const { error: reauthErr } = await supabase.auth.reauthenticate()
                if (reauthErr) { setError(reauthErr.message); return }
                startCooldown()
              } catch { setError('Failed to resend code') }
            }} disabled={resendCooldown > 0} className="w-full text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed">
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
          </form>
        </div>
      )}

      {step === 'done' && success && (
        <p className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4">{success}</p>
      )}

      {/* Email Change Section */}
      {emailStep === 'idle' && !editMode && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 mt-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <Mail className="w-5 h-5" /> Change Email
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Current email: <strong className="dark:text-white">{userEmail}</strong>
          </p>
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="new-email" className="block text-sm font-medium text-gray-700">New Email</label>
              <input id="new-email" type="email" placeholder="Enter new email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button onClick={handleSendEmailOtp} loading={emailOtpLoading} className="w-full">Send OTP</Button>
          </div>
        </div>
      )}

      {emailStep === 'otp' && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 mt-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <Mail className="w-5 h-5" /> Verify New Email
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            A code has been sent to <strong className="dark:text-white">{newEmail}</strong>.
          </p>
          <div className="space-y-4">
            <div className="flex justify-center gap-2" onPaste={handleEmailOtpPaste}>
              {emailOtp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { emailOtpRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleEmailOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleEmailOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={() => { setEmailStep('idle'); setEmailOtp(['', '', '', '', '', '']); setError('') }} variant="outline" className="flex-1">Back</Button>
              <Button onClick={handleVerifyEmailOtp} loading={emailOtpLoading} className="flex-1">Confirm</Button>
            </div>
            <button type="button" onClick={() => handleResendOtp(newEmail, 'email_change')} disabled={resendCooldown > 0} className="w-full text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed">
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}

      {emailStep === 'done' && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 mt-6">
          <h2 className="text-lg font-semibold mb-2 dark:text-white flex items-center gap-2">
            <Mail className="w-5 h-5" /> Email Changed
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Your email has been updated to <strong className="dark:text-white">{userEmail}</strong>.
          </p>
          <Button onClick={() => setEmailStep('idle')} variant="outline" className="w-full">Done</Button>
        </div>
      )}
    </div>
  )
}
