-- ============================================================
-- AseHanta - Complete Clean Schema
-- Run this ONCE in Supabase SQL Editor to rebuild from scratch
-- ============================================================

-- 1. USERS (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'hunter' CHECK (role IN ('hunter', 'lister', 'admin')),
  terms_accepted BOOLEAN DEFAULT false,
  average_rating NUMERIC(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. LISTINGS
CREATE TABLE IF NOT EXISTS public.listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 300),
  rent INTEGER NOT NULL DEFAULT 0,
  deposit INTEGER DEFAULT 0,
  deposit_refundable BOOLEAN DEFAULT TRUE,
  location TEXT NOT NULL,
  descriptive_location TEXT DEFAULT '',
  images TEXT[] DEFAULT '{}',
  youtube_url TEXT,
  video_url TEXT DEFAULT '',
  issues TEXT[] DEFAULT '{}',
  issues_count INTEGER DEFAULT 0,
  house_type TEXT DEFAULT '',
  building_type TEXT DEFAULT '' CHECK (building_type IN ('', 'storey', 'flat')),
  floor_number TEXT DEFAULT '',
  electricity TEXT DEFAULT '',
  electric_bill TEXT DEFAULT '',
  water TEXT DEFAULT '',
  vacancy TEXT DEFAULT 'vacant' CHECK (vacancy IN ('pending', 'vacant')),
  vacancy_type TEXT DEFAULT '',
  why_vacant TEXT DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  lister_phone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'booked', 'taken', 'rejected')),
  uploader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  uploader_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- 3. BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refunded')),
  visit_status TEXT NOT NULL DEFAULT 'pending' CHECK (visit_status IN ('pending', 'visited', 'completed', 'refunded')),
  release_status TEXT DEFAULT 'pending' CHECK (release_status IN ('pending', 'released', 'refund_requested', 'refunded', 'rejected')),
  refund_percentage INTEGER DEFAULT 0,
  refund_amount INTEGER DEFAULT 0,
  refund_reason TEXT DEFAULT '',
  refunded_at TIMESTAMPTZ,
  escrow_hold_id UUID,
  report_id UUID,
  mpesa_receipt TEXT DEFAULT '',
  mpesa_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- 4. MOVERS
CREATE TABLE IF NOT EXISTS public.movers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL,
  location TEXT NOT NULL,
  phone TEXT NOT NULL,
  image TEXT,
  average_rating NUMERIC(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.movers ENABLE ROW LEVEL SECURITY;

-- 5. WIFI PACKAGES
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

-- 6. WIFI CATEGORIES
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

DROP POLICY IF EXISTS "Anyone can read wifi categories" ON public.wifi_categories;
CREATE POLICY "Anyone can read wifi categories"
  ON public.wifi_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert wifi categories" ON public.wifi_categories;
CREATE POLICY "Admins can insert wifi categories"
  ON public.wifi_categories FOR INSERT WITH CHECK (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can update wifi categories" ON public.wifi_categories;
CREATE POLICY "Admins can update wifi categories"
  ON public.wifi_categories FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can delete wifi categories" ON public.wifi_categories;
CREATE POLICY "Admins can delete wifi categories"
  ON public.wifi_categories FOR DELETE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- 7. WIFI PACKAGE ↔ CATEGORY (many-to-many)
CREATE TABLE IF NOT EXISTS public.wifi_package_categories (
  package_id UUID REFERENCES public.wifi_packages(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.wifi_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, category_id)
);

ALTER TABLE public.wifi_package_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read package categories" ON public.wifi_package_categories;
CREATE POLICY "Anyone can read package categories"
  ON public.wifi_package_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage package categories" ON public.wifi_package_categories;
CREATE POLICY "Admins can manage package categories"
  ON public.wifi_package_categories FOR INSERT WITH CHECK (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can delete package categories" ON public.wifi_package_categories;
CREATE POLICY "Admins can delete package categories"
  ON public.wifi_package_categories FOR DELETE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- 8. WIFI BOOKINGS
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

-- 9. CONTACT SUBMISSIONS
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

-- 10. TRANSACTIONS
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

-- 11. OTPS
CREATE TABLE IF NOT EXISTS public.otps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('signup', 'password_reset', 'profile_update')),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_email_type ON public.otps (email, type);
ALTER TABLE public.otps ENABLE ROW LEVEL SECURITY;

-- 12. REVIEWS (listing reviews)
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 13. ESCROW HOLDS
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

-- 14. BOOKING REFUND REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  custom_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 15. FLAGGED REPORTS (general listing/mover/user reports)
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

-- 16. MOVER REVIEWS
CREATE TABLE IF NOT EXISTS public.mover_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mover_id UUID REFERENCES public.movers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mover_reviews ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FOREIGN KEYS (for cross-table refs created above)
-- ============================================================
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_escrow_hold_id_fkey;
ALTER TABLE public.bookings ADD FOREIGN KEY (escrow_hold_id) REFERENCES public.escrow_holds(id) ON DELETE SET NULL;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_report_id_fkey;
ALTER TABLE public.bookings ADD FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE SET NULL;

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- AUTO-UPDATE LISTER RATINGS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_lister_rating()
RETURNS TRIGGER AS $$
DECLARE
  lister_id UUID;
BEGIN
  SELECT uploader_id INTO lister_id FROM public.listings WHERE id = NEW.listing_id;
  UPDATE public.profiles
  SET
    average_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews r JOIN public.listings l ON l.id = r.listing_id WHERE l.uploader_id = lister_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews r JOIN public.listings l ON l.id = r.listing_id WHERE l.uploader_id = lister_id)
  WHERE id = lister_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_review_inserted ON public.reviews;
CREATE TRIGGER on_review_inserted
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lister_rating();

-- ============================================================
-- AUTO-UPDATE MOVER RATINGS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_mover_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.movers
  SET
    average_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.mover_reviews WHERE mover_id = NEW.mover_id),
    total_reviews = (SELECT COUNT(*) FROM public.mover_reviews WHERE mover_id = NEW.mover_id)
  WHERE id = NEW.mover_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_mover_review_inserted ON public.mover_reviews;
CREATE TRIGGER on_mover_review_inserted
  AFTER INSERT ON public.mover_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_mover_rating();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- LISTINGS
DROP POLICY IF EXISTS "Anyone can view published listings" ON public.listings;
CREATE POLICY "Anyone can view published listings" ON public.listings FOR SELECT USING (status = 'published');
DROP POLICY IF EXISTS "Uploaders can view own listings" ON public.listings;
CREATE POLICY "Uploaders can view own listings" ON public.listings FOR SELECT USING (auth.uid() = uploader_id);
DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;
CREATE POLICY "Admins can view all listings" ON public.listings FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Authenticated users can insert listings" ON public.listings;
CREATE POLICY "Authenticated users can insert listings" ON public.listings FOR INSERT WITH CHECK (auth.uid() = uploader_id);
DROP POLICY IF EXISTS "Admins can update any listing" ON public.listings;
CREATE POLICY "Admins can update any listing" ON public.listings FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Uploaders can update own listings" ON public.listings;
CREATE POLICY "Uploaders can update own listings" ON public.listings FOR UPDATE USING (auth.uid() = uploader_id);
DROP POLICY IF EXISTS "Admins can delete listings" ON public.listings;
CREATE POLICY "Admins can delete listings" ON public.listings FOR DELETE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Uploaders can delete own listings" ON public.listings;
CREATE POLICY "Uploaders can delete own listings" ON public.listings FOR DELETE USING (auth.uid() = uploader_id);

-- BOOKINGS
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own bookings" ON public.bookings;
CREATE POLICY "Users can insert own bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
CREATE POLICY "Admins can view all bookings" ON public.bookings FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
CREATE POLICY "Admins can update bookings" ON public.bookings FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- MOVERS
DROP POLICY IF EXISTS "Anyone can read movers" ON public.movers;
CREATE POLICY "Anyone can read movers" ON public.movers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert movers" ON public.movers;
CREATE POLICY "Admins can insert movers" ON public.movers FOR INSERT WITH CHECK (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can update movers" ON public.movers;
CREATE POLICY "Admins can update movers" ON public.movers FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can delete movers" ON public.movers;
CREATE POLICY "Admins can delete movers" ON public.movers FOR DELETE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- WIFI PACKAGES
DROP POLICY IF EXISTS "Anyone can read wifi packages" ON public.wifi_packages;
CREATE POLICY "Anyone can read wifi packages" ON public.wifi_packages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can insert wifi packages" ON public.wifi_packages;
CREATE POLICY "Admins can insert wifi packages" ON public.wifi_packages FOR INSERT WITH CHECK (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can update wifi packages" ON public.wifi_packages;
CREATE POLICY "Admins can update wifi packages" ON public.wifi_packages FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can delete wifi packages" ON public.wifi_packages;
CREATE POLICY "Admins can delete wifi packages" ON public.wifi_packages FOR DELETE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- WIFI BOOKINGS
DROP POLICY IF EXISTS "Anyone can insert wifi bookings" ON public.wifi_bookings;
CREATE POLICY "Anyone can insert wifi bookings" ON public.wifi_bookings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can view all wifi bookings" ON public.wifi_bookings;
CREATE POLICY "Admins can view all wifi bookings" ON public.wifi_bookings FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can update wifi bookings" ON public.wifi_bookings;
CREATE POLICY "Admins can update wifi bookings" ON public.wifi_bookings FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- CONTACT SUBMISSIONS
DROP POLICY IF EXISTS "Anyone can insert contact submissions" ON public.contact_submissions;
CREATE POLICY "Anyone can insert contact submissions" ON public.contact_submissions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can read contact submissions" ON public.contact_submissions;
CREATE POLICY "Admins can read contact submissions" ON public.contact_submissions FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- TRANSACTIONS
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.transactions;
CREATE POLICY "Admins can insert transactions" ON public.transactions FOR INSERT WITH CHECK (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- OTPS
DROP POLICY IF EXISTS "Service role only" ON public.otps;
CREATE POLICY "Service role only" ON public.otps USING (false);

-- REVIEWS
DROP POLICY IF EXISTS "Anyone can read reviews" ON public.reviews;
CREATE POLICY "Anyone can read reviews" ON public.reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "Only booked users can insert reviews" ON public.reviews;
CREATE POLICY "Only booked users can insert reviews" ON public.reviews FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.listing_id = reviews.listing_id
    AND bookings.user_id = auth.uid()
    AND bookings.release_status = 'released'
  )
);

-- ESCROW HOLDS
DROP POLICY IF EXISTS "Users can view own escrow holds" ON public.escrow_holds;
CREATE POLICY "Users can view own escrow holds" ON public.escrow_holds FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own escrow holds" ON public.escrow_holds;
CREATE POLICY "Users can update own escrow holds" ON public.escrow_holds FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can view all escrow holds" ON public.escrow_holds;
CREATE POLICY "Admins can view all escrow holds" ON public.escrow_holds FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- BOOKING REFUND REPORTS
DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Users can insert own reports" ON public.reports FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- FLAGGED REPORTS
DROP POLICY IF EXISTS "Anyone can insert flagged_reports" ON public.flagged_reports;
CREATE POLICY "Anyone can insert flagged_reports" ON public.flagged_reports FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can view all flagged_reports" ON public.flagged_reports;
CREATE POLICY "Admins can view all flagged_reports" ON public.flagged_reports FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');
DROP POLICY IF EXISTS "Admins can update flagged_reports" ON public.flagged_reports;
CREATE POLICY "Admins can update flagged_reports" ON public.flagged_reports FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- MOVER REVIEWS
DROP POLICY IF EXISTS "Anyone can read mover_reviews" ON public.mover_reviews;
CREATE POLICY "Anyone can read mover_reviews" ON public.mover_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert mover_reviews" ON public.mover_reviews;
CREATE POLICY "Authenticated users can insert mover_reviews" ON public.mover_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SCHEMA-LEVEL GRANTS (required after DROP SCHEMA public CASCADE)
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
