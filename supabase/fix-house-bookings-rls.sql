-- Fix RLS policies on house_bookings so hunters can view their own payments
-- Run in Supabase SQL Editor. Safe to re-run.

-- Hunters can view their own house bookings (payments tab).
DROP POLICY IF EXISTS "Hunters can view own house bookings" ON public.house_bookings;
CREATE POLICY "Hunters can view own house bookings" ON public.house_bookings
  FOR SELECT USING (auth.uid() = user_id);

-- Ensure admins can view all house bookings
DROP POLICY IF EXISTS "Admins can view house bookings" ON public.house_bookings;
CREATE POLICY "Admins can view house bookings" ON public.house_bookings
  FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- Hunters can update their own house bookings (confirm / rate / displeased)
DROP POLICY IF EXISTS "Hunters can update own house bookings" ON public.house_bookings;
CREATE POLICY "Hunters can update own house bookings" ON public.house_bookings
  FOR UPDATE USING (auth.uid() = user_id);

-- Listers can view payments on their listings
DROP POLICY IF EXISTS "Listers can view payments on their houses" ON public.house_bookings;
CREATE POLICY "Listers can view payments on their houses" ON public.house_bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = house_bookings.listing_id AND l.uploader_id = auth.uid())
  );
