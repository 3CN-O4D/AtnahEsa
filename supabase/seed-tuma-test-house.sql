-- ============================================================
-- Tuma Go-Live Test House (KES 1)
-- Creates a single 1-KSh published listing for Tuma DevOps to
-- run an end-to-end STK push + callback test before going live.
--
-- Requires: the Tuma payment code already deployed (commit 2877e7c)
-- and the house_bookings 'confirmed' status alter (see migration-tuma.sql).
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Allow a 1-KSh test price (default schema enforces price >= 300).
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_price_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_price_check
  CHECK (price > 0);

-- 2. Remove any previous test house so we always have exactly one.
DELETE FROM public.listings WHERE title = 'Tuma API TEST HOUSE';

-- 3. Clone the most recently published AseHanta (admin) house as the test house.
--    Uses an existing admin-uploaded house so the uploader reference is valid.
INSERT INTO public.listings (
  title, description, price, rent, location, images, youtube_url, video_url,
  issues, issues_count, deposit, electricity, water, why_vacant,
  descriptive_location, payment_method, status, uploader_id, uploader_name,
  created_at, updated_at
)
SELECT
  'Tuma API TEST HOUSE',
  'This is a KES 1 test house created specifically so the Tuma (I&B Bank) team ' ||
  'can run an end-to-end STK push + callback test before AseHanta goes live with ' ||
  'online payments. Please book, pay the KES 1 hunting fee, and confirm the ' ||
  'callback webhook fires correctly. Placeholder house for testing only.',
  '1',                          -- price = 1 (check constraint relaxed above)
  '0',
  location || ' (Tuma Test)',
  images,
  youtube_url,
  video_url,
  issues,
  issues_count,
  deposit,
  electricity,
  water,
  why_vacant,
  CONCAT(COALESCE(descriptive_location, ''), ' - Tuma integration test'),
  'Tuma Test - M-Pesa RTK',
  'published',
  uploader_id,
  uploader_name,
  NOW(),
  NOW()
FROM public.listings
WHERE status = 'published'
  AND uploader_id IN (SELECT id FROM public.profiles WHERE role = 'admin')
ORDER BY created_at DESC
LIMIT 1;

-- 4. Confirm it exists.
SELECT id, title, price, status, location, created_at FROM public.listings WHERE title = 'Tuma API TEST HOUSE';