import Image from 'next/image'
import Link from 'next/link'
import { APP_NAME, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, CONTACT_LOCATION, WHATSAPP_NUMBER, SOCIAL_YOUTUBE, SOCIAL_TWITTER, SOCIAL_INSTAGRAM, SOCIAL_TIKTOK } from '@/lib/constants'

export default function Footer() {
  return (
    <footer className="bg-[#071426] text-blue-100 shrink-0">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <Image src="/images/asehanta-logo.jpeg" alt={APP_NAME} width={28} height={28} className="rounded-full object-cover ring-2 ring-[#D4AF37]/70" />
              <h3 className="brand-wordmark-light font-extrabold text-base">{APP_NAME}</h3>
            </div>
            <p className="text-xs leading-relaxed text-blue-200/70">
              Find, book, and move in with ease. Based in {CONTACT_LOCATION}.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-[#E8C56A] font-semibold text-xs mb-2 uppercase tracking-wider">Links</h4>
            <ul className="space-y-1.5 text-xs">
              <li><Link href="/" className="hover:text-[#F0D78C] transition-colors">Home</Link></li>
              <li><Link href="/brand" className="hover:text-[#F0D78C] transition-colors">Our Story &amp; Logo</Link></li>
              <li><Link href="/movers" className="hover:text-[#F0D78C] transition-colors">Movers</Link></li>
              <li><Link href="/wifi" className="hover:text-[#F0D78C] transition-colors">WiFi</Link></li>
              <li><Link href="/terms" className="hover:text-[#F0D78C] transition-colors">Terms &amp; Conditions</Link></li>
              <li><Link href="/terms/sw" className="hover:text-[#F0D78C] transition-colors">Sheria na Masharti (Kiswahili)</Link></li>
              <li><a href="/contact" className="hover:text-[#F0D78C] transition-colors">Contact Us</a></li>
              <li><Link href="/complaints" className="hover:text-[#F0D78C] transition-colors">Report a Bug</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-[#E8C56A] font-semibold text-xs mb-2 uppercase tracking-wider">Contact</h4>
            <ul className="space-y-1.5 text-xs">
              <li><a href={`tel:${CONTACT_PHONE}`} className="hover:text-[#F0D78C] transition-colors">{CONTACT_PHONE_DISPLAY}</a></li>
              <li><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-[#F0D78C] transition-colors">{CONTACT_EMAIL}</a></li>
              <li><a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#F0D78C] transition-colors">WhatsApp</a></li>
              <li className="text-blue-200/60">{CONTACT_LOCATION}</li>
            </ul>
          </div>

          {/* Social + Collaborators */}
          <div>
            <h4 className="text-[#E8C56A] font-semibold text-xs mb-2 uppercase tracking-wider">Follow Us</h4>
            <div className="space-y-1.5 text-xs">
              <a href={SOCIAL_YOUTUBE} target="_blank" rel="noopener noreferrer" className="block hover:text-[#F0D78C] transition-colors">YouTube</a>
              <a href={SOCIAL_INSTAGRAM} target="_blank" rel="noopener noreferrer" className="block hover:text-[#F0D78C] transition-colors">Instagram</a>
              <a href={SOCIAL_TWITTER} target="_blank" rel="noopener noreferrer" className="block hover:text-[#F0D78C] transition-colors">X (Twitter)</a>
              <a href={SOCIAL_TIKTOK} target="_blank" rel="noopener noreferrer" className="block hover:text-[#F0D78C] transition-colors">TikTok</a>
            </div>
          </div>
        </div>

        {/* Collaborators */}
        <div className="border-t border-blue-900/60 mt-6 pt-5">
          <p className="text-center text-xs text-blue-300/60 mb-3">Our Collaborators</p>
          <div className="flex justify-center items-center gap-3 text-xs text-blue-200/60">
            <span>CHS Hub</span>
            <span className="text-blue-700">|</span>
            <span>Jambonet Kenya</span>
            <span className="text-blue-700">|</span>
            <span>Wasabinet</span>
            <span className="text-blue-700">|</span>
            <span>PulseGaming</span>
            <span className="text-blue-700">|</span>
            <span>Go Cycle</span>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-blue-900/60 text-center text-[10px] text-blue-300/55 space-y-0.5">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p>{CONTACT_LOCATION}</p>
        </div>
      </div>
    </footer>
  )
}
