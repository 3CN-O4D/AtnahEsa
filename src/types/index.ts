export type ListingStatus = 'pending' | 'published' | 'booked' | 'taken' | 'rejected'

export interface Listing {
  id: string
  title: string
  description: string
  price: number
  rent: number
  location: string
  images: string[]
  youtube_url: string | null
  issues: string[]
  issues_count: number
  deposit: number
  electricity: string
  water: string
  why_vacant: string
  descriptive_location: string
  payment_method: string
  status: ListingStatus
  uploader_id: string
  uploader_name: string
  created_at: string
  updated_at: string
}

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
  mpesa_receipt: string
  mpesa_metadata: Record<string, unknown>
  refund_amount: number
  refunded_at: string | null
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
  created_at: string
  updated_at: string
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