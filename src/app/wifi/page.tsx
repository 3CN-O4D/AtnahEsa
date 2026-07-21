'use client'

import { useState, useEffect } from 'react'
import { Zap, Check, Phone, Mail, Clock, Layers, MessageCircle, Wifi, Star } from 'lucide-react'
import Button from '@/components/ui/Button'
import WifiBookingModal from '@/components/wifi/WifiBookingModal'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { WHATSAPP_NUMBER, CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/constants'
import type { WifiPackage, WifiCategory, WifiPackageCategory } from '@/types'

export default function WifiPage() {
  const [packages, setPackages] = useState<WifiPackage[]>([])
  const [categories, setCategories] = useState<WifiCategory[]>([])
  const [pkgCats, setPkgCats] = useState<Record<string, WifiPackageCategory[]>>({})
  const [loading, setLoading] = useState(true)
  const [bookingPkg, setBookingPkg] = useState<WifiPackage | null>(null)

  useEffect(() => {
    const supabase = createClient()
    Promise.allSettled([
      supabase.from('wifi_packages').select('*').order('price'),
      supabase.from('wifi_categories').select('*').order('display_order'),
      supabase.from('wifi_package_categories').select('*'),
    ]).then(([pkgRes, catRes, pcRes]) => {
      if (pkgRes.status === 'fulfilled') setPackages((pkgRes.value.data ?? []) as WifiPackage[])
      if (catRes.status === 'fulfilled') setCategories((catRes.value.data ?? []) as WifiCategory[])

      const grouped: Record<string, WifiPackageCategory[]> = {}
      if (pcRes.status === 'fulfilled') {
        for (const row of pcRes.value.data ?? []) {
          if (!grouped[row.package_id]) grouped[row.package_id] = []
          grouped[row.package_id].push(row as WifiPackageCategory)
        }
      }
      setPkgCats(grouped)
      setLoading(false)
    })
  }, [])

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  function catsForPkg(pkgId: string) {
    return pkgCats[pkgId] ?? []
  }

  function pkgsInCategory(catId: string) {
    return packages.filter((p) => catsForPkg(p.id).some((pc) => pc.category_id === catId))
  }

  function isBestSeller(pkgId: string, catId: string) {
    return catsForPkg(pkgId).some((pc) => pc.category_id === catId && pc.best_seller)
  }

  function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) }
  }

  function tintBg(color: string, alpha = 0.08) {
    const { r, g, b } = hexToRgb(color)
    return `rgba(${r},${g},${b},${alpha})`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Brand Bar */}
      <div style={{ backgroundColor: '#1a5c2a', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">A</div>
            <span className="text-sm font-semibold text-white/80">ASEHANTA</span>
          </div>
          <span className="text-white/30 text-xl font-light">+</span>
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-green-300" />
            <span className="text-sm font-semibold text-white/80">JAMBO NET</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #1a5c2a 0%, #2d8a3e 100%)' }} className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 relative">
          <div className="text-center">
            <h5 className="text-green-200 text-sm font-semibold tracking-widest uppercase mb-3">Get The Best With Us</h5>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
              Fixed Home Wi-Fi <span style={{ color: '#86efac' }}>Solutions</span>
            </h1>
            <p className="text-green-100/80 text-lg max-w-2xl mx-auto leading-relaxed">
              High-speed internet for your home. Installation is FREE and within 48hrs of booking with 24/7 Customer Care.
              Payment can be done after or before installation.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Pricing Section */}
          <section className="py-16">
            <div className="max-w-6xl mx-auto px-4">
              <div className="text-center mb-12">
                <h5 className="text-green-600 text-sm font-semibold tracking-widest uppercase mb-2">Flash Offers</h5>
                <h2 className="text-3xl md:text-4xl font-bold text-[#1a5c2a]">Unlimited Home WiFi Plans</h2>
              </div>

              {categories.map((category) => {
                const pkgs = pkgsInCategory(category.id)
                if (pkgs.length === 0) return null
                const color = category.color || '#2563EB'

                return (
                  <div key={category.id} className="mb-16 last:mb-0">
                    {/* Category container */}
                    <div
                      className="rounded-2xl p-6 md:p-8 border"
                      style={{ backgroundColor: tintBg(color, 0.06), borderColor: tintBg(color, 0.2) }}
                    >
                      <div className="text-center mb-8">
                        <h3 className="text-xl font-bold" style={{ color }}>{category.name}</h3>
                        {category.description && (
                          <p className="text-gray-500 mt-1 text-sm">{category.description}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                        {pkgs.map((pkg) => {
                          const best = isBestSeller(pkg.id, category.id)
                          return (
                            <div
                              key={pkg.id}
                              className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all relative flex flex-col"
                              style={{ borderTop: `4px solid ${color}` }}
                            >
                              {/* Best Seller badge */}
                              {best && (
                                <div className="absolute top-0 left-0 right-0 z-10 py-2 text-center text-sm font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5"
                                  style={{ backgroundColor: color }}>
                                  <Star className="w-4 h-4 fill-current" />
                                  Best Seller
                                </div>
                              )}

                              <div className={best ? 'pt-14' : 'pt-0'}>
                                {/* Header */}
                                <div className="text-center px-6 pt-8 pb-2">
                                  <h3 className="text-xl font-bold" style={{ color }}>{pkg.name}</h3>
                                  <p className="text-gray-400 text-sm mt-1">{pkg.speed} internet speed</p>
                                  <div
                                    className="inline-block mt-3 px-5 py-1.5 rounded text-white text-sm font-semibold"
                                    style={{ backgroundColor: color }}
                                  >
                                    {pkg.speed}
                                  </div>
                                  <div className="flex justify-center gap-3 mt-4" style={{ color }}>
                                    <Zap className="w-5 h-5" />
                                    <Wifi className="w-5 h-5" />
                                    <Layers className="w-5 h-5" />
                                  </div>
                                  <hr className="mt-4 border-gray-100" />
                                </div>

                                {/* Features */}
                                <div className="px-6 py-4 flex-1">
                                  <ul className="space-y-2.5">
                                    {pkg.features.map((f, j) => (
                                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                                        <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />
                                        {f}
                                      </li>
                                    ))}
                                  </ul>
                                  <hr className="mt-4 border-gray-100" />
                                </div>

                                {/* Price */}
                                <div className="text-center px-6 pb-2">
                                  {pkg.original_price > 0 && (
                                    <p className="text-sm text-gray-400 line-through mb-1">
                                      {formatPrice(pkg.original_price)}
                                    </p>
                                  )}
                                  <h2 className="text-3xl font-bold" style={{ color }}>
                                    {formatPrice(pkg.price)}
                                    <sub className="text-base font-normal text-gray-400 bottom-0">/ Month</sub>
                                  </h2>
                                </div>

                                {/* CTA */}
                                <div className="px-6 pb-8 pt-4 text-center">
                                  <button
                                    onClick={() => setBookingPkg(pkg)}
                                    className="inline-block px-8 py-3 rounded text-white font-semibold text-sm transition-all hover:brightness-110"
                                    style={{ backgroundColor: color }}
                                  >
                                    Get Started
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Uncategorized fallback */}
              {packages.filter((p) => catsForPkg(p.id).length === 0).length > 0 && (
                <div className="mb-16">
                  <div className="text-center mb-8">
                    <h3 className="text-xl font-bold text-gray-800">More Packages</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {packages.filter((p) => catsForPkg(p.id).length === 0).map((pkg) => (
                      <div key={pkg.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 flex flex-col">
                        <div className="text-center px-6 pt-8 pb-2">
                          <h3 className="text-xl font-bold text-gray-800">{pkg.name}</h3>
                          <p className="text-gray-400 text-sm mt-1">{pkg.speed} internet speed</p>
                          <hr className="mt-4 border-gray-100" />
                        </div>
                        <div className="px-6 py-4 flex-1">
                          <ul className="space-y-2.5">
                            {pkg.features.map((f, j) => (
                              <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                                <Check className="w-4 h-4 shrink-0 mt-0.5 text-green-500" />
                                {f}
                              </li>
                            ))}
                          </ul>
                          <hr className="mt-4 border-gray-100" />
                        </div>
                        <div className="text-center px-6 pb-2">
                          {pkg.original_price > 0 && (
                            <p className="text-sm text-gray-400 line-through mb-1">{formatPrice(pkg.original_price)}</p>
                          )}
                          <h2 className="text-3xl font-bold text-gray-800">
                            {formatPrice(pkg.price)}
                            <sub className="text-base font-normal text-gray-400 bottom-0">/ Month</sub>
                          </h2>
                        </div>
                        <div className="px-6 pb-8 pt-4 text-center">
                          <button
                            onClick={() => setBookingPkg(pkg)}
                            className="inline-block px-8 py-3 rounded text-white font-semibold text-sm transition-all hover:brightness-110"
                            style={{ backgroundColor: '#22c55e' }}
                          >
                            Get Started
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Contact Section */}
          <section style={{ backgroundColor: '#166534' }} className="py-16">
            <div className="max-w-5xl mx-auto px-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <a href={`tel:${CONTACT_PHONE}`} className="flex items-center gap-4 hover:bg-white/5 rounded-xl p-3 -m-3 transition-colors">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(255,107,0,0.2)' }}>
                    <Phone className="w-5 h-5 text-green-300" />
                  </div>
                  <div>
                    <p className="text-white/60 text-xs uppercase tracking-wider">Call Now</p>
                    <p className="text-white font-semibold">{CONTACT_PHONE}</p>
                  </div>
                </a>
                <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-4 hover:bg-white/5 rounded-xl p-3 -m-3 transition-colors">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(255,107,0,0.2)' }}>
                    <Mail className="w-5 h-5 text-green-300" />
                  </div>
                  <div>
                    <p className="text-white/60 text-xs uppercase tracking-wider">Our Email</p>
                    <p className="text-white font-semibold">{CONTACT_EMAIL}</p>
                  </div>
                </a>
                <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 hover:bg-white/5 rounded-xl p-3 -m-3 transition-colors">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(255,107,0,0.2)' }}>
                    <MessageCircle className="w-5 h-5 text-green-300" />
                  </div>
                  <div>
                    <p className="text-white/60 text-xs uppercase tracking-wider">WhatsApp</p>
                    <p className="text-white font-semibold">Tap to Chat</p>
                  </div>
                </a>
              </div>
              <div className="text-center mt-6 text-green-200/70 text-xs space-y-1">
                <p>info@jambonetkenya.co.ke &middot; hello@asehanta.com</p>
              </div>
            </div>
          </section>

          {/* CTA Buttons */}
          <section className="py-10" style={{ backgroundColor: '#166534', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="max-w-5xl mx-auto px-4">
              <div className="flex flex-wrap justify-center gap-4">
                <a href={`tel:${CONTACT_PHONE}`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded text-white font-semibold text-sm transition-all hover:brightness-110"
                  style={{ backgroundColor: '#22c55e' }}>
                  <Phone className="w-4 h-4" /> Call Now
                </a>
                <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded text-white font-semibold text-sm transition-all hover:brightness-110"
                  style={{ backgroundColor: '#25D366' }}>
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer style={{ backgroundColor: '#1a5c2a' }}>
            <div className="max-w-5xl mx-auto px-4 py-10">
              <div className="text-center">
                <Wifi className="w-8 h-8 mx-auto mb-3 text-green-300" />
                <p className="text-white/60 text-sm">
                  AseHanta in partnership with Jambonet Telecom &mdash; Fast, reliable internet for your home.
                </p>
              </div>
            </div>
            <div className="border-t border-white/10 py-4 text-center">
              <p className="text-white/40 text-xs">Copyright &copy; AseHanta 2025 . All rights reserved.</p>
            </div>
          </footer>
        </>
      )}

      {bookingPkg && <WifiBookingModal pkg={bookingPkg} onClose={() => setBookingPkg(null)} />}
    </div>
  )
}
