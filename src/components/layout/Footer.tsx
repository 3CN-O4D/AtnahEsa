import Link from 'next/link'
import { APP_NAME, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, CONTACT_LOCATION, WHATSAPP_NUMBER, SOCIAL_YOUTUBE, SOCIAL_TWITTER, SOCIAL_INSTAGRAM, SOCIAL_TIKTOK } from '@/lib/constants'

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 shrink-0">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <img src="/images/asehanta-logo.jpeg" alt={APP_NAME} className="h-7 w-7 rounded-full object-cover" />
              <h3 className="text-blue-300 font-bold text-base">{APP_NAME}</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Find, book, and move in with ease. Based in {CONTACT_LOCATION}.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-blue-300 font-semibold text-xs mb-2 uppercase tracking-wider">Links</h4>
            <ul className="space-y-1.5 text-xs">
              <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link href="/movers" className="hover:text-white transition-colors">Movers</Link></li>
              <li><Link href="/wifi" className="hover:text-white transition-colors">WiFi</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link></li>
              <li><a href="/contact" className="hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-blue-300 font-semibold text-xs mb-2 uppercase tracking-wider">Contact</h4>
            <ul className="space-y-1.5 text-xs">
              <li><a href={`tel:${CONTACT_PHONE}`} className="hover:text-white transition-colors">{CONTACT_PHONE_DISPLAY}</a></li>
              <li><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white transition-colors">{CONTACT_EMAIL}</a></li>
              <li><a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="hover:text-green-400 transition-colors">WhatsApp</a></li>
              <li className="text-slate-500">{CONTACT_LOCATION}</li>
            </ul>
          </div>

          {/* Social + Collaborators */}
          <div>
            <h4 className="text-blue-300 font-semibold text-xs mb-2 uppercase tracking-wider">Follow Us</h4>
            <div className="space-y-1.5 text-xs">
              <a href={SOCIAL_YOUTUBE} target="_blank" rel="noopener noreferrer" className="block hover:text-red-400 transition-colors">YouTube</a>
              <a href={SOCIAL_INSTAGRAM} target="_blank" rel="noopener noreferrer" className="block hover:text-pink-400 transition-colors">Instagram</a>
              <a href={SOCIAL_TWITTER} target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">X (Twitter)</a>
              <a href={SOCIAL_TIKTOK} target="_blank" rel="noopener noreferrer" className="block hover:text-cyan-400 transition-colors">TikTok</a>
            </div>
          </div>
        </div>

        {/* Collaborators */}
        <div className="border-t border-slate-800 mt-6 pt-5">
          <p className="text-center text-xs text-slate-600 mb-3">Our Collaborators</p>
          <div className="flex justify-center items-center gap-3 text-xs text-slate-500">
            <span>CHS Hub</span>
            <span className="text-slate-600">|</span>
            <span>Jambonet Kenya</span>
            <span className="text-slate-600">|</span>
            <span>Wasabinet</span>
            <span className="text-slate-600">|</span>
            <span>PulseGaming</span>
            <span className="text-slate-600">|</span>
            <span>Go Cycle</span>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800 text-center text-[10px] text-slate-600 space-y-0.5">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p>{CONTACT_LOCATION}</p>
        </div>
      </div>
    </footer>
  )
}
