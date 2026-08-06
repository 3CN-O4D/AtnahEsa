-- ============================================================
-- Lister House Request Marketplace
-- Listers can view anonymized house requests and claim one when
-- they have a matching house, so admin can notify the requester.
-- Run in Supabase SQL Editor against the LIVE database.
-- ============================================================

-- 1. Track which lister claimed a request (and when)
ALTER TABLE public.house_requests ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.house_requests ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- 2. Allow listers + admins to update the claim fields on requests they can action
DROP POLICY IF EXISTS "Listers can claim requests" ON public.house_requests;
CREATE POLICY "Listers can claim requests"
  ON public.house_requests FOR UPDATE
  USING (
    -- admins can always update
    auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
    -- a lister can claim an unclaimed request (their own claim) or take it over
    OR (claimed_by IS NULL)
    OR (claimed_by = auth.uid())
  );

-- 3. Public-safe view exposing only request spec fields (NO name/email/phone)
DROP VIEW IF EXISTS public.house_requests_public;
CREATE VIEW public.house_requests_public AS
SELECT
  id,
  location,
  min_rent,
  max_rent,
  token_options,
  water_options,
  house_designs,
  deposit_preference,
  deposit_refundable,
  building_type,
  house_type_requested,
  electric_bill,
  vacancy,
  description,
  status,
  claimed_by,
  claimed_at,
  created_at
FROM public.house_requests;

GRANT SELECT ON public.house_requests_public TO authenticated;