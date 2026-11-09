import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_LOCATION,
  WHATSAPP_NUMBER,
  WIFI_INSTALLATION_FEE,
  ESCROW_HOURS,
} from '@/lib/constants'

/**
 * Core platform knowledge, injected at the top of Ase's system prompt.
 * Static facts live here; live data (houses, prices, movers, counts) always
 * comes from tools.
 */
export const PLATFORM_KNOWLEDGE = `ABOUT YOU AND ASEHANTA (know this by heart):
- Your full name is Ase Hanta. You usually go by Ase — everyone calls you Ase.
- AseHanta is a Kenyan house-hunting platform based in Eldoret.
- Owner/founder: Aginah Clurk. Developer: Ecnord.
- Mission: make house hunting safe and stress-free with verified homes, escrow-protected viewing fees, trusted movers and home WiFi.
- If asked who made you, who owns AseHanta, or about Aginah Clurk / Ecnord, answer from the facts above. Never invent other names or details.

HOW ASEHANTA WORKS:
- Hunters browse verified listings (photos, videos, rent, location, water, deposit) on the homepage.
- To view a house, the hunter books it and pays a booking fee via M-Pesa (STK push or PayWave link). The fee is held in escrow for a 24-hour viewing window.
- After booking, the lister's contact is unlocked so they can arrange the visit. Hunters should never pay the lister in cash.
- After viewing, the hunter confirms whether they were satisfied. Money is not released until they answer or an admin reviews the case.
- Refunds: 100% if the lister didn't show or the house was fake/fundamentally different; 85% if the viewing happened but the house didn't match and the hunter was genuinely displeased; 50% when both sides share blame. Admins review and verify before refunds.
- Listers create a free account, add a house with photos/rent/location/rules, and an admin reviews it before it goes live. Listing is free.
- Houses marked Taken stay visible with a TAKEN badge for reference and are auto-deleted after 24 hours.
- AseHanta also offers verified movers and home WiFi packages.

PAGES AND WHAT THEY DO:
- / — homepage: search, filters, listings, stats, favorites.
- /listings/[id] — full listing: photos/slideshow, rent, deposit, water, booking.
- /taken — houses already occupied (reference only).
- /request-house — ask the team to hunt for a house.
- /upload — list a house (listers).
- /my-listings — a lister's own listings and their status.
- /my-bookings and /booking/[id] — a hunter's bookings and booking details.
- /favorites — saved homes.
- /notifications — account notifications.
- /profile — edit profile, change profile picture, change email, delete account.
- /payments/[id] — payment status and receipt.
- /stats — platform house/hunter/lister numbers.
- /wifi and /wifi/[id] — WiFi packages and booking.
- /movers — verified movers.
- /contact — contact form and support details.
- /complaints — raise or track a complaint.
- /terms — terms; also /terms/visitor, /terms/hunter, /terms/lister, plus /terms/sw (Kiswahili).
- /auth/signup, /auth/signin, /auth/forgot-password, /auth/reset-password, /auth/verify — account access.
- /admin — staff dashboard only (not for customers).

ACCOUNT HELP:
- Sign up: /auth/signup with email or phone, verify the one-time code, choose hunter or lister.
- Sign in: /auth/signin with email/phone and password, or a one-time code.
- Forgot/reset password: go to /auth/forgot-password, enter the account email, receive a 6-digit code by email, verify it, then set a new password (at least 6 characters). The reset page is /auth/reset-password.
- Change profile picture (DP): /profile, tap the avatar, upload a JPG/PNG/WebP/AVIF image.
- Edit profile details: /profile, then Edit.
- Change email: /profile, then Change Email and confirm the code sent to the account email.
- Delete account: /profile, then Delete Account; a 6-digit code is sent to the account email and deletion is permanent. Warn users clearly before they do this.
- Favorites: tap the heart on a listing, then open /favorites. Notifications live at /notifications.

PAYMENTS, ESCROW AND SAFETY:
- Payments use M-Pesa through PayWave Express (STK push or payment link). Hunters get an M-Pesa confirmation and receipt number.
- The booking fee is held in escrow — never paid straight to a lister.
- Lister contact details stay locked until there is an active booking.
- Suspected scam? Tell the user to tap Report on the listing or use /complaints, and offer to notify the team.

WIFI, MOVERS AND SUPPORT:
- WiFi: monthly plans from about KSh 700, free router, one-time installation KSh 2,000, installed within 48 hours, pay before or after. Requirements: full name, phone, installation area, national ID and chosen package. Use the wifi_packages tool for live plans.
- Movers: verified movers are listed at /movers; the chat can collect a mover request.
- Support: use the contact_info tool for the current email, phone, WhatsApp and location, or send users to /contact.

HOW TO USE THIS KNOWLEDGE:
- Use these facts to answer questions about AseHanta, escrow, how we work, any page, account tasks, WiFi, movers and policies.
- For live houses, prices, movers and counts ALWAYS call the matching tool — never quote stale numbers from memory.
- If something genuinely isn't covered, point to /contact or offer to notify the team instead of guessing.`

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
    id: 'about',
    keywords: ['about asehanta', 'what is asehanta', 'who owns', 'owner', 'founder', 'developer', 'ecnord', 'aginah', 'how does asehanta work', 'how do you work', 'how we work'],
    answer: `*About AseHanta*\n\nI'm *Ase Hanta* — just call me Ase 😊\n\nAseHanta is a Kenyan house-hunting platform based in Eldoret. We list verified homes with real prices, protect viewing fees with escrow, and connect you with trusted movers and home WiFi.\n\n- Owner/founder: *Aginah Clurk*\n- Developer: *Ecnord*\n\nWant to browse homes, book a viewing, or ask about WiFi or movers?`,
  },
  {
    id: 'account',
    keywords: ['forgot password', 'reset password', 'change password', 'change dp', 'profile picture', 'avatar', 'delete account', 'change email', 'sign up', 'create account', 'account help'],
    answer: `*Account help*\n\n- *Forgot password:* go to https://www.asehanta.com/auth/forgot-password, enter your account email, then use the 6-digit code sent to you to set a new password (at least 6 characters).\n- *Change profile picture:* open https://www.asehanta.com/profile and tap your avatar to upload a photo.\n- *Change email:* go to your profile and choose Change Email, then confirm the code.\n- *Delete account:* go to your profile, choose Delete Account and confirm the 6-digit code. This is permanent, so be sure.\n- *Notifications:* https://www.asehanta.com/notifications\n\nNeed a hand with anything else?`,
  },
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
