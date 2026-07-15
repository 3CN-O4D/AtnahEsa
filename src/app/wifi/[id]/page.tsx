'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Wifi, Zap, Check, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { WifiPackage } from '@/types'

export default function WifiDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [pkg, setPkg] = useState<WifiPackage | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('wifi_packages')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) router.push('/wifi')
        else setPkg(data as WifiPackage)
      })
  }, [id, router])

  if (!pkg) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to packages
      </button>

      <div className="bg-white border rounded-xl p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Wifi className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{pkg.name}</h1>
              <p className="text-gray-500">{pkg.provider}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-sm font-medium rounded-full">
            <Zap className="w-4 h-4" />
            {pkg.speed}
          </span>
        </div>

        <div className="text-3xl font-bold text-blue-600">
          {formatPrice(pkg.price)}
          <span className="text-base font-normal text-gray-400"> / month</span>
        </div>

        <p className="text-gray-600 leading-relaxed">{pkg.description}</p>

        {pkg.features.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Features</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pkg.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 flex items-start gap-3">
          <Clock className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
          <p>
            Interested in this package?{' '}
            <a href="/contact" className="text-blue-600 hover:underline">
              Contact us
            </a>{' '}
            and we&apos;ll help you get connected.
          </p>
        </div>

        <a href="/contact">
          <Button className="w-full" size="lg">
            Get This Package
          </Button>
        </a>
      </div>
    </div>
  )
}
