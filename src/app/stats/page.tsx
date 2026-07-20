'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Home, Users, CalendarCheck, Building } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'

export default function StatsPage() {
  const [stats, setStats] = useState({ houses: 0, bookings: 0, hunters: 0, listers: 0 })

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('listings').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'hunter'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'lister'),
    ]).then(([h, b, hu, li]) => {
      setStats({
        houses: h.count ?? 0,
        bookings: b.count ?? 0,
        hunters: hu.count ?? 0,
        listers: li.count ?? 0,
      })
    })
  }, [])

  const items = [
    { label: 'Houses Listed', value: stats.houses, icon: Home, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Bookings Made', value: stats.bookings, icon: CalendarCheck, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'House Hunters', value: stats.hunters, icon: Users, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Property Listers', value: stats.listers, icon: Building, color: 'text-amber-600', bg: 'bg-amber-100' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">AseHanta by the Numbers</h1>
        <p className="text-gray-500 max-w-lg mx-auto">
          Growing trust in the Kenyan housing market — one verified listing at a time.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.label} className="bg-white border rounded-2xl p-6 text-center hover:shadow-md transition-shadow">
            <div className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center mx-auto mb-3`}>
              <item.icon className={`w-6 h-6 ${item.color}`} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{item.value.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 bg-gradient-to-r from-blue-50 to-green-50 rounded-2xl p-8 text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Ready to find your next home?</h2>
        <p className="text-gray-500 mb-6">Join thousands of happy hunters and listers on AseHanta.</p>
        <Link href="/" className="inline-block bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
          Browse Listings
        </Link>
      </div>
    </div>
  )
}
