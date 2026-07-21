import Link from 'next/link'
import { APP_NAME, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, CONTACT_LOCATION, WHATSAPP_NUMBER, SOCIAL_YOUTUBE, SOCIAL_INSTAGRAM } from '@/lib/constants'

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 h-32 shrink-0 relative">
      <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <img src="/images/asehanta-logo.jpeg" alt={APP_NAME} className="h-6 w-6 rounded-full object-cover" />
          <span className="text-blue-300 font-semibold">{APP_NAME}</span>
        </div>

        <div className="hidden sm:flex items-center gap-4">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="/movers" className="hover:text-white transition-colors">Movers</Link>
          <Link href="/wifi" className="hover:text-white transition-colors">WiFi</Link>
          <a href="/contact" className="hover:text-white transition-colors">Contact</a>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
        </div>

        <div className="flex items-center gap-3">
          <a href={`tel:${CONTACT_PHONE}`} className="hover:text-white transition-colors">{CONTACT_PHONE_DISPLAY}</a>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="hover:text-green-400 transition-colors">WhatsApp</a>
          <a href={SOCIAL_YOUTUBE} target="_blank" rel="noopener noreferrer" className="hover:text-red-400 transition-colors">YouTube</a>
          <a href={SOCIAL_INSTAGRAM} target="_blank" rel="noopener noreferrer" className="hover:text-pink-400 transition-colors">Instagram</a>
        </div>
      </div>
      <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-gray-600">
        &copy; {new Date().getFullYear()} {APP_NAME} &mdash; {CONTACT_LOCATION}
      </div>
    </footer>
  )
}
