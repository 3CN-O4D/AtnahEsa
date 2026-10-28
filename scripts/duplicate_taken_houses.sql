-- SQL to duplicate taken houses to reach 26 total
-- Run this in Supabase SQL Editor

-- First, check current count
SELECT COUNT(*) FROM public.listings WHERE status = 'taken';

-- Duplicate some taken listings to reach 28 total (then remove 2 test = 26)
-- This duplicates the first 2 taken listings (adjust as needed)
WITH to_duplicate AS (
  SELECT 
    id,
    title,
    description,
    price,
    rent,
    location,
    images,
    youtube_url,
    tiktok_url,
    video_url,
    issues,
    issues_count,
    deposit,
    electricity,
    water,
    why_vacant,
    descriptive_location,
    payment_method,
    'taken' as status,
    taken_at,
    uploader_id,
    uploader_name,
    NOW() as created_at,
    NOW() as updated_at
  FROM public.listings
  WHERE status = 'taken'
  ORDER BY created_at DESC
  LIMIT 2  -- Duplicate 2 listings to go from 26 to 28
)
INSERT INTO public.listings (
  id, title, description, price, rent, location, images,
  youtube_url, tiktok_url, video_url, issues, issues_count,
  deposit, electricity, water, why_vacant, descriptive_location,
  payment_method, status, taken_at, uploader_id, uploader_name,
  created_at, updated_at
)
SELECT 
  gen_random_uuid(), title, description, price, rent, location, images,
  youtube_url, tiktok_url, video_url, issues, issues_count,
  deposit, electricity, water, why_vacant, descriptive_location,
  payment_method, status, taken_at, uploader_id, uploader_name,
  created_at, updated_at
FROM to_duplicate;

-- Verify new count
SELECT COUNT(*) FROM public.listings WHERE status = 'taken';

-- To remove 2 test listings (run after verifying)
-- DELETE FROM public.listings 
-- WHERE status = 'taken' 
-- AND title ILIKE '%test%' 
-- LIMIT 2;

-- Or delete by specific IDs if known:
-- DELETE FROM public.listings WHERE id IN ('uuid1', 'uuid2');