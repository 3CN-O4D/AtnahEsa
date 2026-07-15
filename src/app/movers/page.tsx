'use client'

import { useState, useEffect } from 'react'
import { Phone, MapPin, DollarSign } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { Mover } from '@/types'

export default function MoversPage() {
  const [movers, setMovers] = useState<Mover[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('movers')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setMovers((data ?? []) as Mover[]))
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Household Movers</h1>
        <p className="text-gray-600">
          Find reliable movers to help you transport your belongings.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8 text-sm text-amber-800">
        <p className="font-semibold mb-1">We haven't partnered with a moving company yet.</p>
        <p>
          However, we can arrange for a localized mover — a rider or a truck — to help 
          transport your belongings. Contact us and we'll connect you.
        </p>
      </div>

      {movers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No movers listed yet.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {movers.map((mover) => (
          <Card key={mover.id}>
            {mover.image && (
              <img src={mover.image} alt={mover.name} className="w-full h-40 object-cover" />
            )}
            <div className="p-4 space-y-3">
              <h3 className="font-semibold text-lg">{mover.name}</h3>
              <p className="text-sm text-gray-600 line-clamp-2">{mover.description}</p>
              <div className="space-y-1.5 text-sm text-gray-500">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {mover.location}
                </div>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  {formatPrice(mover.price)}
                </div>
              </div>
              <a href={`tel:${mover.phone}`}>
                <Button size="sm" className="w-full">
                  <Phone className="w-4 h-4 mr-1.5" />
                  Call {mover.phone}
                </Button>
              </a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
