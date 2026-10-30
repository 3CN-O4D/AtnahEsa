-- Fix listing image URLs to match actual R2 storage paths
-- Verified: R2 stores at double-prefix (200), DB has single-prefix (404)
-- Convert: media.asehanta.com/asehanta/listings/{uuid}/{file}
--   → media.asehanta.com/asehanta/listings/{uuid}/asehanta/listings/{uuid}/{file}
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).

UPDATE public.listings
SET images = ARRAY(
  SELECT regexp_replace(
    img,
    '^(https://media\.asehanta\.com/asehanta/listings/)([^/]+)/([^/]+)$',
    '\1\2/asehanta/listings/\2/\3'
  )
  FROM unnest(images) AS img
)
WHERE array_length(images, 1) > 0
  AND EXISTS (
    SELECT 1
    FROM unnest(images) AS img
    WHERE img ~ '^https://media\.asehanta\.com/asehanta/listings/[^/]+/[^/]+$'
      AND img !~ 'asehanta/listings/[^/]+/asehanta/listings/'
  );

-- Confirm results
SELECT id, title, images
FROM public.listings
WHERE array_length(images, 1) > 0;
