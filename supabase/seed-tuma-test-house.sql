-- ============================================================
-- Tuma Go-Live Test House (KES 1)
-- Creates a single 1-KSh published listing for Tuma DevOps to run
-- an end-to-end STK push + callback test before going live.
--
-- Requires the Tuma code already deployed (push done) + the
-- house_bookings 'confirmed' status alter.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 0. DIAGNOSTIC: see what source houses exist for cloning.
SELECT 'candidate sources' AS step, count(*) AS n
FROM public.listings
WHERE status = 'published';

SELECT 'published admin house' AS step, count(*) AS n
FROM public.listings
WHERE status = 'published'
  AND uploader_id IN (SELECT id FROM public.profiles WHERE role = 'admin');

-- 1. Allow a 1-KES test price (schema default enforces price >= 300).
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_price_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'listings_price_check'
                   AND conrelid = 'public.listings'::regclass) THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_price_check CHECK (price > 0);
  END IF;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Remove any previous test house (so we keep exactly one).
DELETE FROM public.listings WHERE title = 'Tuma API TEST HOUSE';

-- 3. Clone the source house. Prefer the newest PUBLISHED house uploaded by an
--    admin; otherwise fall back to any published house. If neither exists,
--    nothing is inserted and the diagnostic below will show it.
--    (Admin clone keeps the uploader reference valid; otherwise the raw
--     'taken'/published listing's uploader is used.)
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
  1,
  0,
  COALESCE(location, 'Eldoret') || ' (Tuma Test)',
  COALESCE(images, ARRAY[]::text[]),
  youtube_url,
  video_url,
  COALESCE(issues, ARRAY[]::text[]),
  COALESCE(issues_count, 0),
  COALESCE(deposit, 0),
  electricity,
  water,
  why_vacant,
  CONCAT(COALESCE(descriptive_location, ''), ' - Tuma integration test'),
  'Tuma Test - M-Pesa STK Push',
  'published',
  uploader_id,
  uploader_name,
  NOW(),
  NOW()
FROM public.listings
WHERE status IN ('published', 'taken')
ORDER BY
  CASE WHEN uploader_id IN (SELECT id FROM public.profiles WHERE role = 'admin') THEN 0 ELSE 1 END,
  created_at DESC
LIMIT 1;

-- 4. Confirm it exists.
SELECT id, title, price, status, location, created_at
FROM public.listings
WHERE title = 'Tuma API TEST HOUSE';