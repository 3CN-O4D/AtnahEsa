-- ============================================================
-- Migration: Public-safe profile view (no phone/email leakage)
-- Run this in Supabase SQL Editor against the LIVE database.
-- Replaces the broad "Public can view profiles" policy (added earlier
-- to fix lister names + verified ticks for signed-out users) with a
-- dedicated view exposing only display fields.
-- ============================================================

-- 1. Drop the broad public policy on the raw table
DROP POLICY IF EXISTS "Public can view profiles for listing cards" ON public.profiles;

-- 2. Create a public-safe view with only display fields (no phone/email/username)
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public AS
SELECT
  id,
  full_name,
  role,
  verified,
  avatar_url,
  average_rating,
  total_reviews,
  created_at
FROM public.profiles;

-- 3. Grant read access to anon + authenticated
GRANT SELECT ON public.profiles_public TO anon, authenticated;
