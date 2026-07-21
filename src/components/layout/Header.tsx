'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X, Home, Truck, Wifi, Upload, User as UserIcon, LogOut, Settings, Shield, List, Calendar, Moon, Sun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { APP_NAME } from '@/lib/constants'
import Button from '@/components/ui/Button'
import { useTheme } from '@/lib/ThemeProvider'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { dark, toggle } = useTheme()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user)
      if (data.user) {
        const { data: profile } = await supabase.from('profiles').select('role, avatar_url, full_name').eq('id', data.user.id).maybeSingle()
        setIsAdmin(profile?.role === 'admin')
        setAvatarUrl(profile?.avatar_url || null)
        setDisplayName(profile?.full_name || data.user?.email || null)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const { data: profile } = await supabase.from('profiles').select('role, avatar_url, full_name').eq('id', session.user.id).maybeSingle()
        setIsAdmin(profile?.role === 'admin')
        setAvatarUrl(profile?.avatar_url || null)
        setDisplayName(profile?.full_name || session.user?.email || null)
      } else {
        setIsAdmin(false)
        setAvatarUrl(null)
        setDisplayName(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/movers', label: 'Movers', icon: Truck },
    { href: '/wifi', label: 'WiFi', icon: Wifi },
    { href: '/request-house', label: 'Request House', icon: undefined },
    { href: '/contact', label: 'Contact', icon: undefined },
  ]

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center h-16">
        {/* Left: Logo + Name — flush to left edge */}
        <Link href="/" className="flex items-center gap-2 pl-4 shrink-0">
          <img src="/images/asehanta-logo.jpeg" alt={APP_NAME} className="h-8 w-8 rounded-full object-cover" />
          <span className="text-lg sm:text-xl font-bold text-blue-600">{APP_NAME}</span>
        </Link>

        {/* Center: Desktop nav */}
        <nav className="hidden md:flex items-center justify-center flex-1 gap-5 px-4">
          {navLinks.map(({ href, label }) => (
              <Link key={href} href={href} className="text-sm text-gray-600 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
              {label}
            </Link>
          ))}
          <button onClick={toggle} className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {user && (
            <Link href="/upload">
              <Button size="sm" className="whitespace-nowrap">
                <Upload className="w-4 h-4 mr-1.5" />
                List House
              </Button>
            </Link>
          )}
        </nav>

        {/* Right: Profile — flush to right edge */}
        <div className="hidden md:flex items-center pr-4 shrink-0">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:hover:text-white"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center overflow-hidden">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                    )}
                  </div>
                  <span className="truncate max-w-[120px]">{displayName || user.email}</span>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-lg py-2 z-50">
                  <Link href="/profile" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Settings className="w-4 h-4" /> My Profile
                  </Link>
                  <Link href="/my-listings" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <List className="w-4 h-4" /> My Listings
                  </Link>
                  <Link href="/my-bookings" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Calendar className="w-4 h-4" /> My Bookings
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <Shield className="w-4 h-4" /> Admin Panel
                    </Link>
                  )}
                  <hr className="dark:border-gray-700" />
                  <button onClick={() => { handleSignOut(); setShowUserMenu(false) }} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth/signin">
              <Button size="sm" variant="outline">
                <UserIcon className="w-4 h-4 mr-1.5" />
                Sign In
              </Button>
            </Link>
          )}
        </div>

        {/* Mobile: dark mode + hamburger — flush to right */}
        <div className="md:hidden flex items-center gap-1 pr-4 ml-auto">
          <button onClick={toggle} className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button className="p-2" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="md:hidden border-t bg-white dark:bg-gray-900 dark:border-gray-700 px-4 py-3 space-y-2">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {Icon && <Icon className="w-4 h-4" />}
              {label}
            </Link>
          ))}
          <hr className="my-2 dark:border-gray-700" />
          {user ? (
            <>
              <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                <Settings className="w-4 h-4" /> My Profile
              </Link>
              <Link href="/my-listings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                <List className="w-4 h-4" /> My Listings
              </Link>
              <Link href="/my-bookings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                <Calendar className="w-4 h-4" /> My Bookings
              </Link>
              <Link href="/upload" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                <Upload className="w-4 h-4" />
                List House
              </Link>
              {isAdmin && (
                <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30">
                  <Shield className="w-4 h-4" /> Admin Panel
                </Link>
              )}
              <button onClick={() => { handleSignOut(); setMenuOpen(false) }} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/auth/signin"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            >
              <UserIcon className="w-4 h-4" />
              Sign In
            </Link>
          )}
        </div>
      )}
    </header>
  )
}
