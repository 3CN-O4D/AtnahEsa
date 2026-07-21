import Link from 'next/link'
import { APP_NAME, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, CONTACT_LOCATION, WHATSAPP_NUMBER, SOCIAL_YOUTUBE, SOCIAL_TWITTER, SOCIAL_INSTAGRAM, SOCIAL_TIKTOK } from '@/lib/constants'

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 mt-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/images/asehanta-logo.jpeg" alt={APP_NAME} className="h-8 w-8 rounded-full object-cover" />
              <h3 className="text-blue-300 font-bold text-lg">{APP_NAME}</h3>
            </div>
            <p className="text-sm leading-relaxed">
              Your trusted house hunting platform based in {CONTACT_LOCATION}. Find, book, and move into your next home with ease.
            </p>
          </div>

          <div>
            <h4 className="text-blue-300 font-semibold mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link href="/movers" className="hover:text-white transition-colors">Movers</Link></li>
              <li><Link href="/wifi" className="hover:text-white transition-colors">WiFi Packages</Link></li>
              <li><a href="/contact" className="hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-blue-300 font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white transition-colors">{CONTACT_EMAIL}</a></li>
              <li><a href={`tel:${CONTACT_PHONE}`} className="hover:text-white transition-colors">{CONTACT_PHONE_DISPLAY}</a></li>
              <li><a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="hover:text-green-400 transition-colors">WhatsApp</a></li>
              <li>{CONTACT_LOCATION}</li>
            </ul>
          </div>

          <div>
            <h4 className="text-blue-300 font-semibold mb-3">Follow Us</h4>
            <div className="space-y-2 text-sm">
              <a href={SOCIAL_YOUTUBE} target="_blank" rel="noopener noreferrer" className="block hover:text-red-400 transition-colors">YouTube</a>
              <a href={SOCIAL_TWITTER} target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">X (Twitter)</a>
              <a href={SOCIAL_INSTAGRAM} target="_blank" rel="noopener noreferrer" className="block hover:text-pink-400 transition-colors">Instagram</a>
              <a href={SOCIAL_TIKTOK} target="_blank" rel="noopener noreferrer" className="block hover:text-cyan-400 transition-colors">TikTok</a>
            </div>
          </div>
        </div>

        {/* Collaborators */}
        <div className="border-t border-slate-800 mt-8 pt-6">
          <p className="text-center text-sm text-gray-500 mb-3">Our Collaborators</p>
          <div className="flex justify-center items-center gap-8">
            <a href="https://chshub.co.ke" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors group">
              <div className="w-10 h-10 rounded-lg bg-slate-800 group-hover:bg-slate-700 flex items-center justify-center transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-green-400">
                  <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <span className="text-xs">CHS Hub</span>
            </a>
            <a href="https://jambonetkenya.co.ke" target="_blank" rel="noopener noreferrer" className="opacity-60 hover:opacity-100 transition-opacity">
              <img src="/images/jambonet-logo.jpeg" alt="Jambonet Kenya" className="h-10" />
            </a>
          </div>
        </div>

        <div className="mt-6 pt-6 text-center text-sm space-y-1">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p className="text-gray-500">{CONTACT_LOCATION}</p>
        </div>
      </div>
    </footer>
  )
}
