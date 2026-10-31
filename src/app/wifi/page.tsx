'use client'

import { useState, useEffect } from 'react'
import {
  Zap,
  Check,
  Phone,
  Mail,
  Clock,
  Layers,
  MessageCircle,
  Wifi,
  Star,
  ShieldCheck,
  Timer,
  Headphones,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import Image from 'next/image'
import { SkeletonPage } from '@/components/ui/Skeleton'
import WifiBookingModal from '@/components/wifi/WifiBookingModal'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { WHATSAPP_NUMBER, CONTACT_EMAIL, CONTACT_PHONE, WIFI_INSTALLATION_FEE } from '@/lib/constants'
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

  const uncategorised = packages.filter((p) => catsForPkg(p.id).length === 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Brand Bar */}
      <div
        className="relative overflow-hidden border-b border-white/10"
        style={{ background: 'linear-gradient(100deg, #123f1c 0%, #1a5c2a 45%, #226b33 100%)' }}
      >
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(134,239,172,0.18),transparent_55%)]" />
        <div className="relative mx-auto flex max-w-6xl items-center justify-center gap-6 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white/20 ring-1 ring-white/20">
              <Image src="/images/asehanta-logo.jpeg" alt="AseHanta" fill sizes="40px" className="object-cover" />
            </div>
            <span className="text-sm font-semibold tracking-wide text-white/85">ASEHANTA</span>
          </div>
          <span className="text-xl font-light text-white/25">+</span>
          <div className="flex items-center gap-2">
            <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white/20 ring-1 ring-white/20">
              <Image src="/images/jambonet-logo-big.jpeg" alt="Jambonet" fill sizes="40px" className="object-cover" />
            </div>
            <span className="text-sm font-semibold tracking-wide text-white/85">JAMBO NET</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(140deg, #123f1c 0%, #1a5c2a 40%, #2d8a3e 100%)' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl animate-float" />
          <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-lime-300/15 blur-3xl animate-float [animation-delay:2s]" />
          {/* Signal rings */}
          <div className="absolute right-10 top-1/2 hidden h-64 w-64 -translate-y-1/2 md:block">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="wifi-wave absolute inset-0 rounded-full border border-emerald-200/40"
                style={{ animationDelay: `${i * 1}s` }}
              />
            ))}
            <span className="absolute inset-0 m-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm">
              <Wifi className="h-9 w-9 text-emerald-100" />
            </span>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="max-w-3xl text-center md:mx-auto">
            <span className="inline-flex animate-fadeInDown items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-green-100 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="status-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
              </span>
              Get the best with us
            </span>

            <h1 className="mt-5 animate-fadeInUp text-4xl font-bold leading-[1.1] text-white md:text-6xl">
              Fixed home Wi-Fi,
              <br className="hidden sm:block" />{' '}
              <span className="bg-gradient-to-r from-emerald-200 via-lime-200 to-emerald-100 bg-clip-text text-transparent">
                without the drama.
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl animate-fadeInUp text-base leading-relaxed text-green-100/85 [animation-delay:120ms] md:text-lg">
              High-speed internet for your home. Installation fee KES {WIFI_INSTALLATION_FEE.toLocaleString()} applies.
              Installed within 48hrs of booking, with 24/7 customer care. Pay before or after installation.
            </p>

            <div className="mt-8 flex animate-fadeInUp flex-wrap items-center justify-center gap-3 [animation-delay:220ms]">
              <a
                href="#plans"
                className="tap-scale inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#1a5c2a] shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                <Zap className="h-4 w-4" /> See plans
              </a>
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-scale inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <MessageCircle className="h-4 w-4" /> Talk to us
              </a>
            </div>

            <dl className="mx-auto mt-10 grid max-w-2xl animate-fadeInUp grid-cols-1 gap-3 [animation-delay:320ms] sm:grid-cols-3">
              {[
                { Icon: Timer, title: '48-hour install', copy: 'Booked, verified, connected' },
                { Icon: Headphones, title: '24/7 support', copy: 'Real humans on call' },
                { Icon: ShieldCheck, title: 'No lock-in', copy: 'Pay monthly, stay flexible' },
              ].map(({ Icon, title, copy }) => (
                <div
                  key={title}
                  className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-left backdrop-blur transition-colors hover:bg-white/15"
                >
                  <Icon className="h-5 w-5 shrink-0 text-emerald-200" />
                  <div>
                    <dt className="text-xs font-bold text-white">{title}</dt>
                    <dd className="text-[11px] text-green-100/70">{copy}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Wave divider */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-gray-50 dark:to-slate-950" />
      </section>

      {loading ? (
        <SkeletonPage />
      ) : (
        <>
          {/* Pricing Section */}
          <section id="plans" className="scroll-mt-6 py-14 md:py-20">
            <div className="mx-auto max-w-6xl px-4">
              <div className="mb-10 text-center md:mb-14">
                <h5 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="h-3.5 w-3.5" /> Flash offers
                </h5>
                <h2 className="text-3xl font-bold tracking-tight text-[#1a5c2a] dark:text-emerald-100 md:text-4xl">
                  Unlimited home WiFi plans
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                  Pick a speed that fits your household. Every plan includes the router, installation and support.
                </p>
              </div>

              {packages.length === 0 && (
                <div className="mx-auto max-w-md animate-scaleIn rounded-2xl border border-dashed border-emerald-300 bg-white p-8 text-center dark:border-emerald-800 dark:bg-slate-900">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
                    <Wifi className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="font-semibold text-gray-800 dark:text-gray-100">Plans are being updated</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Call or WhatsApp us and we&apos;ll set you up with the best package for your area.
                  </p>
                  <a href={`tel:${CONTACT_PHONE}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                    <Phone className="h-4 w-4" /> {CONTACT_PHONE}
                  </a>
                </div>
              )}

              {categories.map((category, catIndex) => {
                const pkgs = pkgsInCategory(category.id)
                if (pkgs.length === 0) return null
                const color = category.color || '#2563EB'

                return (
                  <div key={category.id} className="mb-14 last:mb-0 animate-fadeInUp" style={{ animationDelay: `${catIndex * 80}ms` }}>
                    <div
                      className="relative overflow-hidden rounded-3xl border p-5 md:p-8"
                      style={{ backgroundColor: tintBg(color, 0.06), borderColor: tintBg(color, 0.2) }}
                    >
                      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl" style={{ backgroundColor: tintBg(color, 0.5) }} />

                      <div className="relative mb-8 text-center">
                        <h3 className="text-xl font-bold md:text-2xl" style={{ color }}>{category.name}</h3>
                        {category.description && (
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{category.description}</p>
                        )}
                      </div>

                      <div className="relative grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                        {pkgs.map((pkg, pkgIndex) => {
                          const best = isBestSeller(pkg.id, category.id)
                          return (
                            <div
                              key={pkg.id}
                              className="group relative flex animate-fadeInUp flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.03] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl dark:bg-slate-900 dark:ring-white/5"
                              style={{ borderTop: `4px solid ${color}`, animationDelay: `${pkgIndex * 90}ms` }}
                            >
                              {best && (
                                <div
                                  className="relative z-10 flex items-center justify-center gap-1.5 overflow-hidden py-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                                  style={{ backgroundColor: color }}
                                >
                                  <span aria-hidden className="animate-sheen absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.45)_50%,transparent_75%)] bg-[length:250%_100%]" style={{ animationDuration: '3.5s' }} />
                                  <Star className="relative h-3.5 w-3.5 fill-current" />
                                  <span className="relative">Best seller</span>
                                </div>
                              )}

                              <div className="flex flex-1 flex-col">
                                {/* Header */}
                                <div className="px-6 pb-2 pt-7 text-center">
                                  <h3 className="text-xl font-bold" style={{ color }}>{pkg.name}</h3>
                                  <p className="mt-1 text-sm text-gray-400">{pkg.speed} internet speed</p>

                                  <div
                                    className="mt-3 inline-block rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm"
                                    style={{ backgroundColor: color }}
                                  >
                                    {pkg.speed}
                                  </div>

                                  <div className="mt-4 flex justify-center gap-3 transition-transform duration-300 group-hover:scale-110" style={{ color }}>
                                    <Zap className="h-5 w-5" />
                                    <Wifi className="h-5 w-5" />
                                    <Layers className="h-5 w-5" />
                                  </div>
                                  <hr className="mt-4 border-gray-100 dark:border-gray-800" />
                                </div>

                                {/* Features */}
                                <div className="flex-1 px-6 py-4">
                                  <ul className="space-y-2.5">
                                    {pkg.features.map((f, j) => (
                                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: tintBg(color, 0.14) }}>
                                          <Check className="h-3 w-3" style={{ color }} />
                                        </span>
                                        {f}
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {/* Price */}
                                <div className="px-6 pb-1 text-center">
                                  {pkg.original_price > 0 && (
                                    <p className="mb-1 text-sm text-gray-400 line-through">{formatPrice(pkg.original_price)}</p>
                                  )}
                                  <h2 className="text-3xl font-extrabold tracking-tight" style={{ color }}>
                                    {formatPrice(pkg.price)}
                                    <sub className="bottom-0 text-sm font-normal text-gray-400">/ month</sub>
                                  </h2>
                                </div>

                                {/* CTA */}
                                <div className="px-6 pb-7 pt-4">
                                  <button
                                    onClick={() => setBookingPkg(pkg)}
                                    className="tap-scale group/btn inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:brightness-110 hover:shadow-lg"
                                    style={{ backgroundColor: color, boxShadow: `0 10px 22px -14px ${color}` }}
                                  >
                                    Get started
                                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
                                  </button>
                                  <p className="mt-2 text-center text-[11px] text-gray-400">
                                    Free router · Install in 48hrs
                                  </p>
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
              {uncategorised.length > 0 && (
                <div className="mb-14 animate-fadeInUp">
                  <div className="mb-8 text-center">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 md:text-2xl">More packages</h3>
                  </div>
                  <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                    {uncategorised.map((pkg, i) => (
                      <div
                        key={pkg.id}
                        className="group flex animate-fadeInUp flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl dark:border-gray-700 dark:bg-slate-900"
                        style={{ animationDelay: `${i * 80}ms` }}
                      >
                        <div className="px-6 pb-2 pt-7 text-center">
                          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{pkg.name}</h3>
                          <p className="mt-1 text-sm text-gray-400">{pkg.speed} internet speed</p>
                          <hr className="mt-4 border-gray-100 dark:border-gray-800" />
                        </div>
                        <div className="flex-1 px-6 py-4">
                          <ul className="space-y-2.5">
                            {pkg.features.map((f, j) => (
                              <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                                {f}
                              </li>
                            ))}
                          </ul>
                          <hr className="mt-4 border-gray-100 dark:border-gray-800" />
                        </div>
                        <div className="px-6 pb-1 text-center">
                          {pkg.original_price > 0 && (
                            <p className="mb-1 text-sm text-gray-400 line-through">{formatPrice(pkg.original_price)}</p>
                          )}
                          <h2 className="text-3xl font-extrabold tracking-tight text-gray-800 dark:text-gray-100">
                            {formatPrice(pkg.price)}
                            <sub className="bottom-0 text-sm font-normal text-gray-400">/ month</sub>
                          </h2>
                        </div>
                        <div className="px-6 pb-7 pt-4">
                          <button
                            onClick={() => setBookingPkg(pkg)}
                            className="tap-scale inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#22c55e] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:brightness-110"
                          >
                            Get started <ArrowRight className="h-4 w-4" />
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
          <section className="relative overflow-hidden py-16" style={{ backgroundColor: '#14532d' }}>
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(134,239,172,0.16),transparent_55%)]" />
            <div className="relative mx-auto max-w-5xl px-4">
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-white md:text-3xl">Not sure which plan?</h2>
                <p className="mt-2 text-sm text-green-100/70">Tell us your area and household size — we&apos;ll recommend the right speed.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  { href: `tel:${CONTACT_PHONE}`, Icon: Phone, label: 'Call now', value: CONTACT_PHONE },
                  { href: `mailto:${CONTACT_EMAIL}`, Icon: Mail, label: 'Our email', value: CONTACT_EMAIL },
                  { href: `https://wa.me/${WHATSAPP_NUMBER}`, Icon: MessageCircle, label: 'WhatsApp', value: 'Tap to chat' },
                ].map(({ href, Icon, label, value }) => (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur transition-all duration-200 hover:-translate-y-1 hover:border-white/25 hover:bg-white/10"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 ring-1 ring-emerald-300/30 transition-transform duration-300 group-hover:scale-110">
                      <Icon className="h-5 w-5 text-green-200" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">{label}</p>
                      <p className="truncate text-sm font-semibold text-white">{value}</p>
                    </div>
                  </a>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-[11px] text-green-200/60">
                <Clock className="h-3.5 w-3.5" />
                <span>Mon–Sat, 8am – 8pm · Installation fee KES {WIFI_INSTALLATION_FEE.toLocaleString()}</span>
              </div>
            </div>
          </section>

          {/* CTA Buttons */}
          <section className="py-10" style={{ backgroundColor: '#14532d', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="mx-auto max-w-5xl px-4">
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href={`tel:${CONTACT_PHONE}`}
                  className="tap-scale inline-flex items-center gap-2 rounded-xl bg-[#22c55e] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 hover:brightness-110"
                >
                  <Phone className="h-4 w-4" /> Call now
                </a>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-scale inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 hover:brightness-110"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer style={{ backgroundColor: '#1a5c2a' }}>
            <div className="mx-auto max-w-5xl px-4 py-10">
              <div className="text-center">
                <Wifi className="mx-auto mb-3 h-8 w-8 text-green-300" />
                <p className="text-sm text-white/60">
                  AseHanta in partnership with Jambonet Telecom &mdash; fast, reliable internet for your home.
                </p>
                <p className="mt-2 text-xs text-green-200/50">
                  info@jambonetkenya.co.ke &middot; hello@asehanta.com
                </p>
              </div>
            </div>
            <div className="border-t border-white/10 py-4 text-center">
              <p className="text-xs text-white/40">Copyright &copy; AseHanta 2025. All rights reserved.</p>
            </div>
          </footer>
        </>
      )}

      {bookingPkg && <WifiBookingModal pkg={bookingPkg} onClose={() => setBookingPkg(null)} />}
    </div>
  )
}
