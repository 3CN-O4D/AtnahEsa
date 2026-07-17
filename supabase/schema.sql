-- ============================================================
-- AseHanta - Full Database Schema
-- Run this in Supabase SQL Editor to set up the database
-- ============================================================

-- 1. USERS (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'hunter' CHECK (role IN ('hunter', 'lister', 'admin')),
  terms_accepted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- 2. LISTINGS
CREATE TABLE IF NOT EXISTS public.listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 300),
  rent INTEGER NOT NULL DEFAULT 0,
  location TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  youtube_url TEXT,
  video_url TEXT DEFAULT '',
  issues TEXT[] DEFAULT '{}',
  issues_count INTEGER DEFAULT 0,
  deposit INTEGER DEFAULT 0,
  electricity TEXT DEFAULT '',
  water TEXT DEFAULT '',
  why_vacant TEXT DEFAULT '',
  descriptive_location TEXT DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'booked', 'taken', 'rejected')),
  uploader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  uploader_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Everyone can read published listings
CREATE POLICY "Anyone can view published listings"
  ON public.listings FOR SELECT
  USING (status = 'published');

-- Uploaders can view own listings
CREATE POLICY "Uploaders can view own listings"
  ON public.listings FOR SELECT
  USING (auth.uid() = uploader_id);

-- Admins can view all listings
CREATE POLICY "Admins can view all listings"
  ON public.listings FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- Uploaders can insert
CREATE POLICY "Authenticated users can insert listings"
  ON public.listings FOR INSERT
  WITH CHECK (auth.uid() = uploader_id);

-- Admins can update any listing
CREATE POLICY "Admins can update any listing"
  ON public.listings FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- Admins can delete listings
CREATE POLICY "Admins can delete listings"
  ON public.listings FOR DELETE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- 3. BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refunded')),
  visit_status TEXT NOT NULL DEFAULT 'pending' CHECK (visit_status IN ('pending', 'visited', 'completed', 'refunded')),
  mpesa_receipt TEXT DEFAULT '',
  mpesa_metadata JSONB DEFAULT '{}',
  refund_amount INTEGER DEFAULT 0,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all bookings"
  ON public.bookings FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can update bookings"
  ON public.bookings FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- 4. MOVERS
CREATE TABLE IF NOT EXISTS public.movers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL,
  location TEXT NOT NULL,
  phone TEXT NOT NULL,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.movers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read movers"
  ON public.movers FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert movers"
  ON public.movers FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can update movers"
  ON public.movers FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can delete movers"
  ON public.movers FOR DELETE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- 5. WIFI CATEGORIES
CREATE TABLE IF NOT EXISTS public.wifi_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'Wifi',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wifi_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wifi categories"
  ON public.wifi_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert wifi categories"
  ON public.wifi_categories FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can update wifi categories"
  ON public.wifi_categories FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can delete wifi categories"
  ON public.wifi_categories FOR DELETE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- Seed default categories
INSERT INTO public.wifi_categories (name, description, color, display_order) VALUES
  ('Home Packages', 'High-speed internet for your home', '#2563EB', 1),
  ('Device Plans', 'Perfect for individual devices', '#059669', 2)
ON CONFLICT DO NOTHING;

-- 6. WIFI PACKAGE ↔ CATEGORY (many-to-many)
CREATE TABLE IF NOT EXISTS public.wifi_package_categories (
  package_id UUID REFERENCES public.wifi_packages(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.wifi_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, category_id)
);

ALTER TABLE public.wifi_package_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read package categories"
  ON public.wifi_package_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage package categories"
  ON public.wifi_package_categories FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

CREATE POLICY "Admins can delete package categories"
  ON public.wifi_package_categories FOR DELETE
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 7. WIFI PACKAGES
CREATE TABLE IF NOT EXISTS public.wifi_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  speed TEXT NOT NULL,
  price INTEGER NOT NULL,
  description TEXT NOT NULL,
  features TEXT[] DEFAULT '{}',
  original_price INTEGER DEFAULT 0,
  category TEXT DEFAULT 'home',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wifi_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wifi packages"
  ON public.wifi_packages FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert wifi packages"
  ON public.wifi_packages FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can update wifi packages"
  ON public.wifi_packages FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can delete wifi packages"
  ON public.wifi_packages FOR DELETE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- 8. CONTACT SUBMISSIONS
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  id_number TEXT NOT NULL,
  location TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert contact submissions"
  ON public.contact_submissions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read contact submissions"
  ON public.contact_submissions FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- 9. ADMIN ROLE FUNCTION & TRIGGER
-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, phone, role, terms_accepted)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'role', 'hunter'),
    COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 10. TRANSACTIONS LOG
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  amount INTEGER NOT NULL,
  mpesa_receipt TEXT DEFAULT '',
  mpesa_message TEXT DEFAULT '',
  checkout_request_id TEXT DEFAULT '',
  result_code INTEGER,
  result_desc TEXT,
  raw_callback JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can insert transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- 11. WIFI BOOKINGS
CREATE TABLE IF NOT EXISTS public.wifi_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID REFERENCES public.wifi_packages(id) ON DELETE SET NULL,
  package_name TEXT NOT NULL,
  package_speed TEXT NOT NULL DEFAULT '',
  package_price INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT NOT NULL,
  id_number TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wifi_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert wifi bookings"
  ON public.wifi_bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all wifi bookings"
  ON public.wifi_bookings FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can update wifi bookings"
  ON public.wifi_bookings FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- 12. OTPS (custom OTP verification)
CREATE TABLE IF NOT EXISTS public.otps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('signup', 'password_reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_email_type ON public.otps (email, type);

ALTER TABLE public.otps ENABLE ROW LEVEL SECURITY;

-- Only the server (service_role) can manage OTPs
CREATE POLICY "Service role only"
  ON public.otps
  USING (false);

-- 12. HELPER FUNCTION: Create first admin (run manually after setting up)
-- Run this in Supabase SQL Editor AFTER creating your own account:
-- UPDATE public.profiles SET role = 'admin' WHERE id = '<your-user-uuid>';

-- 13. NEW COLUMNS for listings (house_type, deposit_refundable, electric_bill, vacancy, vacancy_type)
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS house_type TEXT DEFAULT '';
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deposit_refundable BOOLEAN DEFAULT TRUE;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS electric_bill TEXT DEFAULT '';
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS vacancy TEXT DEFAULT 'available' CHECK (vacancy IN ('pending', 'available'));
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS vacancy_type TEXT DEFAULT '';

-- 14. RATINGS & REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reviews"
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Lister can update/delete own listings + view their own
CREATE POLICY "Uploaders can update own listings"
  ON public.listings FOR UPDATE
  USING (auth.uid() = uploader_id);

CREATE POLICY "Uploaders can delete own listings"
  ON public.listings FOR DELETE
  USING (auth.uid() = uploader_id);

-- Add lister phone to listings
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS lister_phone TEXT DEFAULT '';

-- 15. ESCROW HOLDS
CREATE TABLE IF NOT EXISTS public.escrow_holds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded')),
  held_until TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.escrow_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own escrow holds"
  ON public.escrow_holds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own escrow holds"
  ON public.escrow_holds FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all escrow holds"
  ON public.escrow_holds FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 16. REPORTS (for rejecting a house)
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('scam', 'not_as_advertised', 'hidden_issues', 'other')),
  custom_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all reports"
  ON public.reports FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Add release_status and refund columns to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'pending' CHECK (release_status IN ('pending', 'released', 'refund_requested', 'refunded', 'rejected'));
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_percentage INTEGER DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_reason TEXT DEFAULT '';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS escrow_hold_id UUID REFERENCES public.escrow_holds(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL;

-- Add average_rating to profiles for lister ratings
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

-- 17. Storey/Flat columns for listings
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS building_type TEXT DEFAULT '' CHECK (building_type IN ('', 'storey', 'flat'));
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS floor_number TEXT DEFAULT '';

-- 18. GENERAL REPORTS (listings, movers, etc)
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('listing', 'mover', 'user')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'action_taken')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert reports"
  ON public.reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all reports"
  ON public.reports FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

CREATE POLICY "Admins can update reports"
  ON public.reports FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 19. FLAGGED REPORTS (general reports for listings, movers, etc)
CREATE TABLE IF NOT EXISTS public.flagged_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_email TEXT DEFAULT '',
  target_type TEXT NOT NULL CHECK (target_type IN ('listing', 'mover', 'user')),
  target_id TEXT NOT NULL,
  target_title TEXT DEFAULT '',
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'action_taken')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.flagged_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert flagged_reports"
  ON public.flagged_reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all flagged_reports"
  ON public.flagged_reports FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

CREATE POLICY "Admins can update flagged_reports"
  ON public.flagged_reports FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 20. MOVER REVIEWS
CREATE TABLE IF NOT EXISTS public.mover_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mover_id UUID REFERENCES public.movers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mover_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read mover_reviews"
  ON public.mover_reviews FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert mover_reviews"
  ON public.mover_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add rating columns to movers
ALTER TABLE public.movers ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE public.movers ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;
