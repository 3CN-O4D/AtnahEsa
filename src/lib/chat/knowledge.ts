import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_LOCATION,
  WHATSAPP_NUMBER,
  WIFI_INSTALLATION_FEE,
  ESCROW_HOURS,
} from '@/lib/constants'

/** Everything a customer needs before a WiFi installation can be booked. */
export const WIFI_REQUIREMENTS = `*To get WiFi you'll need*\n\n- Your full name\n- Phone number\n- The area where it'll be installed\n- National ID number\n- The package you want\n\nInstallation is a one-time *KSh ${WIFI_INSTALLATION_FEE.toLocaleString()}* and the router is free.\nWe install within 48 hours — you can pay before or after installation.\n\nBrowse plans: https://www.asehanta.com/wifi\nOr say *book wifi* and I'll take your details.`

export interface FaqEntry {
  id: string
  /** Keywords that trigger this FAQ (lower-cased). */
  keywords: string[]
  answer: string
}

/** Built from the published Terms pages + escrow implementation. */
export const FAQ: FaqEntry[] = [
  {
    id: 'escrow',
    keywords: ['escrow', 'holding', 'hold', 'hold money', 'booking fee', 'where does my money', 'safe'],
    answer: `*How escrow works*\n\n1. When you book a viewing, the booking fee is paid via M-Pesa and held safely in escrow.\n2. A 24-hour view window starts — you're expected to visit the house.\n3. You unlock the lister's contact to coordinate the visit.\n4. After viewing, you confirm whether you were satisfied.\n5. Your money is *never released* to either side until you've answered — or an admin has reviewed the case.\n\nSo your money stays protected until the viewing actually happens.`,
  },
  {
    id: 'refunds',
    keywords: ['refund', 'refunds', 'money back', 'my money', 'get my money', 'reimburse', 'charged back'],
    answer: `*Refund policy*\n\n- *100% refund* if the lister didn't show up, or the house was fake / totally different from the listing.\n- *85% refund* if the viewing happened but the house didn't match what was advertised and you were genuinely displeased.\n- *50% refund* when both sides share blame.\n\nRefunds are processed after an admin reviews the case and verifies the M-Pesa refund message. Payouts depend on M-Pesa processing times.`,
  },
  {
    id: 'payment_methods',
    keywords: ['pay', 'payment', 'mpesa', 'm-pesa', 'paywave', 'stk', 'paybill', 'till', 'how do i pay'],
    answer: `*How payments work*\n\nPayments are made through M-Pesa using the PayWave Express payment page. When you book a house you get an STK push (or a payment link) for the exact booking fee.\n\n- No cash handed to the lister directly.\n- The fee goes into escrow first (see escrow).\n- You'll get an M-Pesa confirmation with a receipt number.`,
  },
  {
    id: 'booking_flow',
    keywords: ['book', 'booking', 'book a viewing', 'view house', 'schedule', 'visit', 'viewing'],
    answer: `*How to book a house*\n\n1. Open a listing you like and tap *Book now*.\n2. Pay the booking fee via M-Pesa (STK push / PayWave link).\n3. Escrow holds it for the 24-hour view window.\n4. You unlock the lister's contact details to arrange the visit.\n5. After viewing, confirm on the platform whether you were satisfied.`,
  },
  {
    id: 'listing_fee',
    keywords: ['list a house', 'list house', 'how much to list', 'listing fee', 'post a house', 'upload a house', 'add a house'],
    answer: `*Listing a house*\n\nListing a house on AseHanta is free. Create a lister account, tap *+ List a House*, and fill in the details — photos, rent, location and house rules. Your listing is reviewed before going live.\n\nYou can start here: https://www.asehanta.com/upload`,
  },
  {
    id: 'verify',
    keywords: ['verify', 'verification', 'verified', 'trust', 'scam', 'fake', 'legit'],
    answer: `*Trust & safety*\n\n- Listing photos, prices and availability are reviewed before going live.\n- Lister contact details stay locked until you have an active booking — this protects you from off-platform payment pressure.\n- Payments go through escrow, so your money is never paid straight to a stranger.\n\nIf you ever suspect a scam listing, tap *Report* on that listing — an admin will review it.`,
  },
  {
    id: 'taken',
    keywords: ['taken', 'taken houses', 'occupied', 'no longer available', 'sold'],
    answer: `*Taken houses*\n\nA house marked *Taken* has already been occupied, so it's no longer bookable. You can still view its details for reference. Use the search or filters on the homepage to see *Available* houses only.`,
  },
  {
    id: 'deposit',
    keywords: ['deposit', 'deposit refundable', 'security deposit'],
    answer: `*Deposits*\n\nEach listing shows its deposit amount and whether it's refundable. That's the deposit the landlord asks for when you move in — it's separate from the small booking fee you pay on AseHanta to secure a viewing.`,
  },
  {
    id: 'wifi_requirements',
    keywords: ['what do i need for wifi', 'what do i need to get wifi', 'wifi requirements', 'requirements for wifi', 'documents for wifi', 'need to get wifi', 'needed for wifi', 'require for wifi'],
    answer: WIFI_REQUIREMENTS,
  },
  {
    id: 'wifi',
    keywords: ['wifi', 'internet', 'wifi package', 'installation', 'jambonet', 'fibre', 'router'],
    answer: `*WiFi packages*\n\nWe list verified home WiFi packages (e.g. Jambonet and other providers). Monthly prices start around KSh 1,000, plus a one-time installation fee of KSh ${WIFI_INSTALLATION_FEE.toLocaleString()}.\n\nBrowse them here: https://www.asehanta.com/wifi\nOr ask me to *arrange a WiFi booking* for you.`,
  },
  {
    id: 'movers',
    keywords: ['mover', 'movers', 'moving', 'transport', 'truck', 'relocation', 'move house'],
    answer: `*Movers*\n\nWe connect you with verified movers for house moves. You can browse them here: https://www.asehanta.com/movers\n\nOr just tell me you need a mover and I'll collect your details and hand you to our team on WhatsApp.`,
  },
  {
    id: 'request_house',
    keywords: ['request a house', 'house request', 'find me a house', 'looking for', 'searching for'],
    answer: `I can help you find a house! 🏠\n\nJust tell me what you're looking for — for example:\n> *2BR, water and rent inclusive, around Kipkaren or Annex*\n> *Bedsitter in Langas under 10k*\n> *Self-contained studio in Nairobi*\n\nOr I can ask you a few quick questions and search for you.`,
  },
  {
    id: 'terms',
    keywords: ['terms', 'conditions', 't&c', 'tc', 'rules', 'legal', 'policy'],
    answer: `*Terms & conditions*\n\nThe full terms are here: https://www.asehanta.com/terms\n\nWe have versions for different users:\n- Visitors (just browsing): https://www.asehanta.com/terms/visitor\n- House hunters: https://www.asehanta.com/terms/hunter\n- Listers: https://www.asehanta.com/terms/lister\n- Admin / swahili versions are linked from the main terms page.\n\nAsk me about escrow, refunds or payments and I'll summarise those specifically.`,
  },
  {
    id: 'stats',
    keywords: ['stats', 'statistics', 'how many houses', 'how many users', 'numbers', 'count', 'how many'],
    answer: `Let me check the current numbers for you — one moment. 📊`,
  },
]

export interface ContactInfo {
  email: string
  phone: string
  whatsapp: string
  location: string
  hours: string
}

export const CONTACT_INFO: ContactInfo = {
  email: CONTACT_EMAIL,
  phone: CONTACT_PHONE_DISPLAY,
  whatsapp: `https://wa.me/${WHATSAPP_NUMBER}`,
  location: CONTACT_LOCATION,
  hours: 'Our team responds on WhatsApp and email, usually within 24 hours.',
}

/** Shortcut links the bot can hand out for common requests. */
export const PAGE_LINKS: Record<string, { label: string; href: string }> = {
  home: { label: '🏠 Home — browse houses', href: 'https://www.asehanta.com/' },
  listings: { label: '🏡 All house listings', href: 'https://www.asehanta.com/' },
  wifi: { label: '📶 WiFi packages', href: 'https://www.asehanta.com/wifi' },
  movers: { label: '🚚 Movers', href: 'https://www.asehanta.com/movers' },
  request: { label: '📝 Request a house', href: 'https://www.asehanta.com/request-house' },
  upload: { label: '➕ List a house', href: 'https://www.asehanta.com/upload' },
  bookings: { label: '🗓️ My bookings', href: 'https://www.asehanta.com/my-bookings' },
  taken: { label: '🚫 Taken houses', href: 'https://www.asehanta.com/taken' },
  terms: { label: '📄 Terms & conditions', href: 'https://www.asehanta.com/terms' },
  contact: { label: '📞 Contact us', href: 'https://www.asehanta.com/contact' },
  stats: { label: '📊 House stats', href: 'https://www.asehanta.com/stats' },
  favorites: { label: '❤️ My favourites', href: 'https://www.asehanta.com/favorites' },
  signup: { label: '✨ Create an account', href: 'https://www.asehanta.com/auth/signup' },
  signin: { label: '🔑 Sign in', href: 'https://www.asehanta.com/auth/signin' },
}

export const ESCROW_HOURS_TEXT = ESCROW_HOURS
