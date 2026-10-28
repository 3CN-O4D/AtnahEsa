export const APP_NAME = 'AseHanta'
export const MIN_BOOKING_FEE = 499
export const PLATFORM_COMMISSION = 0.5
export const OWNER_SHARE = 0.5
export const ITEMS_PER_PAGE = 12

export const WIFI_INSTALLATION_FEE = 2000
export const WIFI_MONTHLY_MIN = 1000

export const ESCROW_HOURS = 24
export const REFUND_PERCENTAGES = {
  FAKE_NO_SHOW: 1.0,
  VIEWED_CHANGED_MIND: 0.85,
} as const

export const VIEW_WINDOW_HOURS = 24
export const REFUND_PROCESSING_HOURS = 24
export const REVERSAL_WINDOW_HOURS = 48

export const R2_MEDIA_RETENTION_DAYS = 90
export const R2_TAKEN_RETENTION_DAYS = 2
export const R2_MULTIPART_ABORT_DAYS = 7

export const SORT_OPTIONS = [
  { label: 'Rent: Low to High', value: 'rent_asc' },
  { label: 'Rent: High to Low', value: 'rent_desc' },
  { label: 'Charge: Low to High', value: 'price_asc' },
  { label: 'Charge: High to Low', value: 'price_desc' },
  { label: 'Location', value: 'location' },
  { label: 'No Issues', value: 'issues_asc' },
  { label: 'Most Issues', value: 'issues_desc' },
] as const

export const TILL_NUMBER = '4376459'
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
