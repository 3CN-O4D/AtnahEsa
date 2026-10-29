-- Seed a KES 1 test house for end-to-end PayWave testing
-- Run in Supabase SQL Editor. Safe to re-run.

-- Allow price = 1 (schema enforces price >= 300)
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

-- Remove any previous test house
DELETE FROM public.listings WHERE title = 'KES 1 Test House (PayWave)';

-- Insert a published KES 1 house (use the first admin profile as uploader)
INSERT INTO public.listings (
  title, description, price, rent, location, images,
  payment_method, status, uploader_id, uploader_name, created_at, updated_at
)
SELECT
  'KES 1 Test House (PayWave)',
  'Test listing for PayWave STK push end-to-end verification. Price: KES 1.',
  1,
  0,
  'Eldoret (PayWave Test)',
  ARRAY[]::text[],
  'M-Pesa',
  'published',
  p.id,
  p.full_name || ' (' || p.email || ')',
  NOW(),
  NOW()
FROM public.profiles p
WHERE p.role = 'admin'
ORDER BY p.created_at ASC
LIMIT 1;

-- Confirm
SELECT id, title, price, status, location, uploader_id
FROM public.listings
WHERE title = 'KES 1 Test House (PayWave)';
