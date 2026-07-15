export const APP_NAME = 'AseHanta'
export const MIN_BOOKING_FEE = 300
export const PLATFORM_COMMISSION = 0.3 // 30%
export const OWNER_SHARE = 0.7 // 70%
export const ITEMS_PER_PAGE = 12

export const SORT_OPTIONS = [
  { label: 'Rent: Low to High', value: 'rent_asc' },
  { label: 'Rent: High to Low', value: 'rent_desc' },
  { label: 'Charge: Low to High', value: 'price_asc' },
  { label: 'Charge: High to Low', value: 'price_desc' },
  { label: 'Location', value: 'location' },
  { label: 'No Issues', value: 'issues_asc' },
  { label: 'Most Issues', value: 'issues_desc' },
] as const

export const CONTACT_EMAIL = 'asehanta@gmail.com'
export const CONTACT_PHONE = '+254748275079'
export const CONTACT_PHONE_DISPLAY = '+254 748 275 079'
export const WHATSAPP_NUMBER = '254748275079'
export const CONTACT_LOCATION = 'Eldoret, Kenya'
export const SOCIAL_YOUTUBE = 'https://youtube.com/@AseHanta'
export const SOCIAL_TWITTER = 'https://x.com/AseHanta'
export const SOCIAL_INSTAGRAM = 'https://instagram.com/AseHanta'
export const SOCIAL_TIKTOK = 'https://tiktok.com/@AseHanta'

export const ISSUE_FILTERS = [
  { label: 'All', value: '' },
  { label: '0 Issues', value: '0' },
  { label: '1 Issue', value: '1' },
  { label: '2 Issues', value: '2' },
  { label: '3 Issues', value: '3' },
  { label: '4 Issues', value: '4' },
  { label: '5+ Issues', value: '5' },
] as const
