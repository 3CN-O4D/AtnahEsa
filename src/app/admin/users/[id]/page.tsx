'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Listing } from '@/types'

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [role, setRole] = useState('')

  useEffect(() => {
    const supabase = createClient()

    supabase.from('profiles').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setProfile(data as Profile)
        setRole(data.role)
      }
    })

    supabase.from('listings').select('*').eq('uploader_id', id).order('created_at', { ascending: false }).then(({ data }) => {
      setListings((data ?? []) as Listing[])
    })
  }, [id])

  const handleSaveRole = async () => {
    const supabase = createClient()
    await supabase.from('profiles').update({ role }).eq('id', id)
    router.push('/admin')
  }

  if (!profile) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-bold">{profile.full_name}</h1>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Username:</span> {profile.username}</div>
          <div><span className="text-gray-500">Phone:</span> {profile.phone || '-'}</div>
          <div><span className="text-gray-500">Joined:</span> {new Date(profile.created_at).toLocaleDateString()}</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Role:</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="text-sm border rounded px-2 py-1">
              <option value="hunter">Hunter</option>
              <option value="lister">Lister</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <Button size="sm" onClick={handleSaveRole}>Save Role</Button>
      </div>

      {listings.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Listings by {profile.full_name}</h2>
          <div className="space-y-3">
            {listings.map((l) => (
              <div key={l.id} className="bg-white border rounded-xl p-3 flex items-center gap-3">
                <img src={l.images[0] || '/placeholder.jpg'} alt="" className="w-16 h-12 rounded object-cover" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{l.title}</p>
                  <p className="text-xs text-gray-500">{l.location} | {l.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}