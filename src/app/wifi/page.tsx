'use client'

import { useState, useEffect } from 'react'
import { Zap, Check, Phone, Mail, Clock, Layers, MessageCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { WHATSAPP_NUMBER, CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/constants'
import type { WifiPackage, WifiCategory } from '@/types'

const LOGO_ASEHANTA = '/images/asehanta-logo.jpeg'
const LOGO_JAMBONET = '/images/jambonet-logo.jpeg'

export default function WifiPage() {
  const [packages, setPackages] = useState<WifiPackage[]>([])
  const [categories, setCategories] = useState<WifiCategory[]>([])
  const [pkgCats, setPkgCats] = useState<Record<string, string[]>>({})
  const [userInfo, setUserInfo] = useState<{ name?: string; email?: string; phone?: string }>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('wifi_packages').select('*').order('price'),
      supabase.from('wifi_categories').select('*').order('display_order'),
      supabase.from('wifi_package_categories').select('*'),
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return {}
        const { data: profile } = await supabase.from('profiles').select('full_name, email, phone').eq('id', data.user.id).single()
        return profile ?? {}
      }),
    ]).then(([pkgRes, catRes, pcRes, profile]) => {
      setPackages((pkgRes.data ?? []) as WifiPackage[])
      setCategories((catRes.data ?? []) as WifiCategory[])
      setUserInfo(profile as { name?: string; email?: string; phone?: string })

      const grouped: Record<string, string[]> = {}
      for (const row of pcRes.data ?? []) {
        if (!grouped[row.package_id]) grouped[row.package_id] = []
        grouped[row.package_id].push(row.category_id)
      }
      setPkgCats(grouped)
      setLoading(false)
    })
  }, [])

  const waMsg = (pkg: WifiPackage) => {
    const parts = [`Hi AseHanta! I'm interested in the ${pkg.name} (${pkg.speed}) at ${formatPrice(pkg.price)}/month.`]
    if (userInfo.name) parts.push(`\nName: ${userInfo.name}`)
    if (userInfo.email) parts.push(`Email: ${userInfo.email}`)
    if (userInfo.phone) parts.push(`Phone: ${userInfo.phone}`)
    if (!userInfo.name) parts.push(`\nPlease share more details.`)
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(parts.join('\n'))}`
  }

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const catIdsForPkg = (pkgId: string) => pkgCats[pkgId] ?? []
  const pkgsInCategory = (catId: string) => packages.filter((p) => catIdsForPkg(p.id).includes(catId))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Brand Bar */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <img src={LOGO_ASEHANTA} alt="AseHanta" className="h-8 w-8 rounded-full object-cover" />
            <span className="text-sm font-semibold text-gray-700">ASEHANTA</span>
          </div>
          <span className="text-gray-300 text-xl font-light">+</span>
          <div className="flex items-center gap-2">
            <img src={LOGO_JAMBONET} alt="Jambonet" className="h-8 w-8 rounded-full object-cover" />
            <span className="text-sm font-semibold text-gray-700">JAMBO NET</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-4 py-1.5 rounded-full mb-4">
              <Zap className="w-4 h-4" /> FLASH OFFERS
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-3">
              Jambonet WiFi <span className="text-yellow-300">Offers</span>
            </h1>
            <p className="text-blue-100 text-lg max-w-xl mx-auto">
              High-speed internet for your home. Installation is FREE and within 48hrs of booking.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {categories.map((category, idx) => {
            const pkgs = pkgsInCategory(category.id)
            if (pkgs.length === 0) return null
            return (
              <section key={category.id} className={idx % 2 === 0 ? 'py-12' : 'bg-white border-t border-b py-12'}>
                <div className="max-w-6xl mx-auto px-4">
                  <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3" style={{ backgroundColor: category.color + '15', color: category.color }}>
                      <Layers className="w-3.5 h-3.5" />
                      {category.name}
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">{category.name}</h2>
                    {category.description && <p className="text-gray-500 mt-1">{category.description}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {pkgs.map((pkg, i) => (
                      <div key={pkg.id + category.id} className={`bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-lg ${i === 1 ? 'ring-2 scale-[1.02]' : 'border-gray-200'}`}
                        style={i === 1 ? { borderColor: category.color, '--tw-ring-color': category.color + '33' } as React.CSSProperties : {}}>
                        {i === 1 && (
                          <div className="text-white text-center text-xs font-medium py-1" style={{ backgroundColor: category.color }}>BEST SELLER</div>
                        )}
                        <div className="p-5 space-y-4">
                          <div className="text-center">
                            <h3 className="font-bold text-lg">{pkg.name}</h3>
                            <div className="inline-flex items-center gap-1 mt-1 px-3 py-0.5 text-xs font-semibold rounded-full" style={{ backgroundColor: category.color + '15', color: category.color }}>
                              <Zap className="w-3 h-3" /> {pkg.speed}
                            </div>
                          </div>
                          <div className="text-center">
                            {pkg.original_price > 0 && <p className="text-sm text-gray-400 line-through">{formatPrice(pkg.original_price)}</p>}
                            <p className="text-3xl font-bold text-gray-900">{formatPrice(pkg.price)}</p>
                            <p className="text-sm text-gray-500">/month</p>
                          </div>
                          <ul className="space-y-2">
                            {pkg.features.map((f, j) => (
                              <li key={j} className="flex items-start gap-2 text-xs text-gray-600">
                                <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: category.color }} />
                                {f}
                              </li>
                            ))}
                          </ul>
                          <a href={waMsg(pkg)} target="_blank" rel="noopener noreferrer">
                            <Button className="w-full" size="sm">Get Package</Button>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )
          })}

          {/* Uncategorized fallback */}
          {packages.filter((p) => catIdsForPkg(p.id).length === 0).length > 0 && (
            <section className="py-12">
              <div className="max-w-6xl mx-auto px-4">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900">More Packages</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {packages.filter((p) => catIdsForPkg(p.id).length === 0).map((pkg) => (
                    <div key={pkg.id} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 hover:shadow-lg transition-shadow">
                      <div className="text-center">
                        <h3 className="font-bold text-lg">{pkg.name}</h3>
                        <div className="inline-flex items-center gap-1 mt-1 px-3 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                          <Zap className="w-3 h-3" /> {pkg.speed}
                        </div>
                      </div>
                      <div className="text-center">
                        {pkg.original_price > 0 && <p className="text-sm text-gray-400 line-through">{formatPrice(pkg.original_price)}</p>}
                        <p className="text-3xl font-bold text-gray-900">{formatPrice(pkg.price)}</p>
                        <p className="text-sm text-gray-500">/month</p>
                      </div>
                      <ul className="space-y-2">
                        {pkg.features.map((f, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-gray-600">
                            <Check className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <a href={waMsg(pkg)} target="_blank" rel="noopener noreferrer">
                        <Button className="w-full" size="sm">Get Package</Button>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Installation & Contact */}
          <section className="max-w-4xl mx-auto px-4 py-12">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 text-blue-800">
                <Clock className="w-6 h-6" />
                <p className="font-semibold">Installation is FREE and WITHIN 48hrs of booking with 24/7 Customer Care.</p>
              </div>
              <p className="text-sm text-gray-600">Payment can be done after or before installation.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <a href={`tel:${CONTACT_PHONE}`} className="bg-white rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Phone className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Call</p>
                    <p className="font-semibold">0748 275 079</p>
                  </div>
                </a>
                <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="bg-white rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">WhatsApp</p>
                    <p className="font-semibold">Tap to Chat</p>
                  </div>
                </a>
                <a href={`mailto:${CONTACT_EMAIL}`} className="bg-white rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-semibold">{CONTACT_EMAIL}</p>
                  </div>
                </a>
              </div>
              <div className="flex gap-3 pt-2">
                <a href={`tel:${CONTACT_PHONE}`}><Button><Phone className="w-4 h-4 mr-1.5" /> Call Now</Button></a>
                <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer"><Button variant="outline"><MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp</Button></a>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
