-- ============================================================
-- Migration: Taken houses public + auto-delete after 24h + WhatsApp booking
-- Run this in Supabase SQL Editor against the LIVE database.
-- ============================================================

-- 1. Add taken_at column (for auto-delete after a day)
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;

-- 2. Make taken listings publicly visible (was: status = 'published')
DROP POLICY IF EXISTS "Anyone can view published listings" ON public.listings;
CREATE POLICY "Anyone can view published listings"
  ON public.listings FOR SELECT
  USING (status IN ('published', 'taken'));

-- 3. Auto-delete function for taken listings older than 24 hours
CREATE OR REPLACE FUNCTION public.delete_expired_taken_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.listings
  WHERE status = 'taken'
    AND taken_at IS NOT NULL
    AND taken_at < now() - interval '24 hours';
END;
$$;

-- 4. WhatsApp house bookings (no auth required — anyone can request a viewing)
CREATE TABLE IF NOT EXISTS public.house_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  listing_title TEXT NOT NULL DEFAULT '',
  listing_location TEXT NOT NULL DEFAULT '',
  listing_price INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT NOT NULL,
  id_number TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.house_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert house bookings" ON public.house_bookings;
CREATE POLICY "Anyone can insert house bookings" ON public.house_bookings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view house bookings" ON public.house_bookings;
CREATE POLICY "Admins can view house bookings" ON public.house_bookings FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

DROP POLICY IF EXISTS "Admins can update house bookings" ON public.house_bookings;
CREATE POLICY "Admins can update house bookings" ON public.house_bookings FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- 5. Optional: schedule the cleanup job (enable pg_cron extension first)
-- select cron.schedule('cleanup-taken-listings', '0 * * * *', 'select public.delete_expired_taken_listings();');
