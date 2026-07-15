import { APP_NAME, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, CONTACT_LOCATION, WHATSAPP_NUMBER, SOCIAL_YOUTUBE, SOCIAL_TWITTER, SOCIAL_INSTAGRAM, SOCIAL_TIKTOK } from '@/lib/constants'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12 mt-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/images/asehanta-logo.jpeg" alt={APP_NAME} className="h-8 w-8 rounded-full object-cover" />
              <h3 className="text-white font-bold text-lg">{APP_NAME}</h3>
            </div>
            <p className="text-sm leading-relaxed">
              Your trusted house hunting platform based in {CONTACT_LOCATION}. Find, book, and move into your next home with ease.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/" className="hover:text-white transition-colors">Home</a></li>
              <li><a href="/movers" className="hover:text-white transition-colors">Movers</a></li>
              <li><a href="/wifi" className="hover:text-white transition-colors">WiFi Packages</a></li>
              <li><a href="/contact" className="hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white transition-colors">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a href={`tel:${CONTACT_PHONE}`} className="hover:text-white transition-colors">
                  {CONTACT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-green-400 transition-colors"
                >
                  WhatsApp
                </a>
              </li>
              <li>{CONTACT_LOCATION}</li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Follow Us</h4>
            <div className="space-y-2 text-sm">
              <a href={SOCIAL_YOUTUBE} target="_blank" rel="noopener noreferrer" className="block hover:text-red-400 transition-colors">YouTube</a>
              <a href={SOCIAL_TWITTER} target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">X (Twitter)</a>
              <a href={SOCIAL_INSTAGRAM} target="_blank" rel="noopener noreferrer" className="block hover:text-pink-400 transition-colors">Instagram</a>
              <a href={SOCIAL_TIKTOK} target="_blank" rel="noopener noreferrer" className="block hover:text-cyan-400 transition-colors">TikTok</a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm space-y-1">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p className="text-gray-500">{CONTACT_LOCATION}</p>
        </div>
      </div>
    </footer>
  )
}
