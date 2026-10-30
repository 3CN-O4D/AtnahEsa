-- Fix double-prefix path bug in existing listing image URLs
-- Images were stored as: asahanta/listings/{user.id}/asehanta/listings/{user.id}/{file}
-- Should be: asahanta/listings/{user.id}/{file}
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).

UPDATE public.listings
SET images = ARRAY(
  SELECT regexp_replace(
    img,
    'asehanta/listings/([^/]+)/asehanta/listings/\1/',
    'asehanta/listings/\1/'
  )
  FROM unnest(images) AS img
)
WHERE array_length(images, 1) > 0
  AND EXISTS (
    SELECT 1
    FROM unnest(images) AS img
    WHERE img LIKE 'asehanta/listings/%/asehanta/listings/%/%'
  );

-- Confirm how many were fixed
SELECT id, title, images
FROM public.listings
WHERE array_length(images, 1) > 0
  AND EXISTS (
    SELECT 1
    FROM unnest(images) AS img
    WHERE img LIKE 'asehanta/listings/%/asehanta/listings/%/%'
  );
