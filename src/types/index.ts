export type ListingStatus = 'pending' | 'published' | 'booked' | 'taken' | 'rejected'
export type VacancyStatus = 'pending' | 'available'

export interface Listing {
  id: string
  title: string
  description: string
  price: number
  rent: number
  location: string
  images: string[]
  youtube_url: string | null
  video_url: string | null
  issues: string[]
  issues_count: number
  deposit: number
  deposit_refundable: boolean
  electricity: string
  electric_bill: string
  water: string
  why_vacant: string
  vacancy: VacancyStatus
  vacancy_type: string
  house_type: string
  building_type: string
  floor_number: string
  descriptive_location: string
  payment_method: string
  lister_phone: string
  status: ListingStatus
  uploader_id: string
  uploader_name: string
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  listing_id: string
  user_id: string
  rating: number
  comment: string
  created_at: string
}

export type EscrowStatus = 'held' | 'released' | 'refunded'

export interface EscrowHold {
  id: string
  booking_id: string
  user_id: string
  listing_id: string
  amount: number
  status: EscrowStatus
  held_until: string
  released_at: string | null
  refunded_at: string | null
  created_at: string
}

export type ReportReason = 'scam' | 'not_as_advertised' | 'hidden_issues' | 'other'

export interface Report {
  id: string
  booking_id: string
  user_id: string
  listing_id: string
  reason: ReportReason
  custom_reason: string
  created_at: string
}

export type ReleaseStatus = 'pending' | 'released' | 'refund_requested' | 'refunded' | 'rejected'

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded'
export type VisitStatus = 'pending' | 'visited' | 'completed' | 'refunded'

export interface Booking {
  id: string
  listing_id: string
  user_id: string
  amount: number
  phone: string
  status: BookingStatus
  visit_status: VisitStatus
  release_status: ReleaseStatus
  refund_percentage: number
  refund_reason: string
  mpesa_receipt: string
  mpesa_metadata: Record<string, unknown>
  refund_amount: number
  refunded_at: string | null
  escrow_hold_id: string | null
  report_id: string | null
  created_at: string
}

export interface Mover {
  id: string
  name: string
  description: string
  price: number
  location: string
  phone: string
  image: string | null
  average_rating: number
  total_reviews: number
  created_at: string
}

export interface MoverReview {
  id: string
  mover_id: string
  user_id: string
  rating: number
  comment: string
  created_at: string
}

export interface WifiCategory {
  id: string
  name: string
  description: string
  color: string
  icon: string
  display_order: number
  created_at: string
}

export interface WifiPackage {
  id: string
  name: string
  provider: string
  speed: string
  price: number
  description: string
  features: string[]
  original_price: number
  category: string
  created_at: string
}

export interface Transaction {
  id: string
  booking_id: string | null
  user_id: string | null
  phone: string
  amount: number
  mpesa_receipt: string
  mpesa_message: string
  checkout_request_id: string
  result_code: number | null
  result_desc: string
  raw_callback: Record<string, unknown>
  status: 'pending' | 'success' | 'failed'
  created_at: string
}

export interface Profile {
  id: string
  username: string
  full_name: string
  phone: string
  role: 'hunter' | 'lister' | 'admin'
  avatar_url: string | null
  average_rating: number
  total_reviews: number
  created_at: string
  updated_at: string
}

export interface WifiBooking {
  id: string
  package_id: string
  package_name: string
  package_speed: string
  package_price: number
  name: string
  phone: string
  area: string
  id_number: string
  status: 'pending' | 'contacted' | 'completed' | 'cancelled'
  created_at: string
}

export interface ContactSubmission {
  id: string
  name: string
  phone: string
  email: string
  id_number: string
  location: string
  message: string
  created_at: string
}