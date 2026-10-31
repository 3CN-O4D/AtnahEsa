-- ============================================================
-- New changes for AseHanta
-- Run this in Supabase SQL Editor after the main schema
-- ============================================================

-- 1. Verified badge for listers (admin can toggle)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

-- 2. Taken house: record who took it
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS taken_by_name TEXT DEFAULT '';

-- 3. Allow all OTP types used in the app (login = passwordless email code)
ALTER TABLE public.otps DROP CONSTRAINT IF EXISTS otps_type_check;
ALTER TABLE public.otps ADD CONSTRAINT otps_type_check CHECK (type IN ('signup', 'login', 'password_reset', 'password_create', 'email_change', 'profile_update', 'delete_account'));

-- 4. Account-linked favourites
CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own favourites" ON public.favorites;
CREATE POLICY "Users manage own favourites" ON public.favorites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS favorites_user_idx ON public.favorites (user_id, created_at DESC);

-- 5. Complaints, bug reports and feature requests
CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'complaint' CHECK (category IN ('complaint','bug','payment','listing','account','feature','other')),
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  admin_note text NOT NULL DEFAULT '',
  related_listing_id uuid NULL,
  related_booking_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS complaints_status_idx ON public.complaints (status, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_user_idx ON public.complaints (user_id);

-- 6. Media move queue used by the R2/Cloudinary migration worker
CREATE TABLE IF NOT EXISTS public.media_move_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NULL,
  source_url text NOT NULL,
  target_key text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_move_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS media_move_queue_status_idx ON public.media_move_queue (status, created_at);

-- 7. Public, anonymised house requests + claim-to-upload flow
ALTER TABLE public.house_requests ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.house_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS listings_request_idx ON public.listings (request_id);

DROP VIEW IF EXISTS public.house_requests_public;
CREATE VIEW public.house_requests_public AS
SELECT
  id, location, min_rent, max_rent,
  token_options, water_options, house_designs,
  deposit_preference, deposit_refundable,
  building_type, house_type_requested, electric_bill, vacancy,
  description, status, claimed_by, claimed_at, created_at
FROM public.house_requests;

GRANT SELECT ON public.house_requests_public TO anon, authenticated;
