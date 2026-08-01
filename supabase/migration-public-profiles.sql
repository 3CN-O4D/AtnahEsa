-- ============================================================
-- Migration: Let public view profile display info (name, verified, role)
-- Run this in Supabase SQL Editor against the LIVE database.
-- Fixes listing cards showing emails instead of lister names + verified ticks
-- for signed-out users.
-- ============================================================

DROP POLICY IF EXISTS "Public can view profiles for listing cards" ON public.profiles;
CREATE POLICY "Public can view profiles for listing cards"
  ON public.profiles FOR SELECT
  USING (true);
