'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Home,
  ArrowLeftRight,
  Users,
  FileText,
  Wrench,
  Upload,
  Banknote,
  Menu,
  X,
  Shield,
  MessageSquareWarning,
  ReceiptText,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'

const navGroups = [
  {
    label: 'Overview',
    links: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin?tab=houses', label: 'Houses', icon: Home },
      { href: '/admin?tab=transactions', label: 'Transactions', icon: ArrowLeftRight },
      { href: '/admin?tab=users', label: 'Users', icon: Users },
      { href: '/admin?tab=requests', label: 'Requests', icon: FileText },
    ],
  },
  {
    label: 'Operations',
    links: [
      { href: '/admin/treasury', label: 'Treasury', icon: Banknote },
      { href: '/admin/services', label: 'Services', icon: Wrench },
      { href: '/admin/upload', label: 'List House', icon: Upload },
    ],
  },
  {
    label: 'Support',
    links: [
      { href: '/admin/complaints', label: 'Complaints', icon: MessageSquareWarning, badge: true },
      { href: '/admin/receipts', label: 'Receipts', icon: ReceiptText },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  )
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openComplaints, setOpenComplaints] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push(signInUrl(currentPathWithSearch()))
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (profile?.role !== 'admin') {
        router.push('/')
        return
      }
      setChecking(false)
    })
  }, [router])

  // Small live badge so support work is visible from anywhere in the panel.
  useEffect(() => {
    if (checking) return
    let cancelled = false
    fetch('/api/complaints?status=open')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setOpenComplaints(data.length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [checking, pathname])

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Shield className="h-8 w-8 animate-pulse text-emerald-400" />
          <p className="text-sm">Checking admin access…</p>
        </div>
      </div>
    )
  }

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin' && !searchParams.toString()
    if (href.startsWith('/admin?')) {
      const param = href.split('?')[1]
      return pathname === '/admin' && searchParams.toString() === param
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
        <Link href="/admin" className="group flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950 shadow-lg shadow-emerald-500/20 transition-transform group-hover:scale-105">
            <Shield className="h-4.5 w-4.5" />
          </span>
          <span>
            <span className="block text-sm font-extrabold tracking-tight text-white">AseHanta</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
              Admin console
            </span>
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white md:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.links.map(({ href, label, icon: Icon, badge }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      active
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {active && (
                      <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-400" />
                    )}
                    <Icon className={`h-4 w-4 transition-colors ${active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <span className="flex-1">{label}</span>
                    {badge && openComplaints > 0 && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                        {openComplaints > 99 ? '99+' : openComplaints}
                      </span>
                    )}
                    {active && <ChevronRight className="h-3.5 w-3.5 text-emerald-400/70" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <ExternalLink className="h-4 w-4" />
          Back to site
        </Link>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-screen w-64 shrink-0 transition-transform duration-200 md:sticky md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebar}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/90 px-4 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-slate-800"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Shield className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">Admin console</span>
          {openComplaints > 0 && (
            <Link
              href="/admin/complaints"
              className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            >
              {openComplaints} open
            </Link>
          )}
        </div>

        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </div>
    </div>
  )
}
