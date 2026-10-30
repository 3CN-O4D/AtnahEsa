-- Fix listing image URLs to match actual R2 storage paths
-- R2 stores files at double-prefix: asahanta/listings/{uuid}/asehanta/listings/{uuid}/{file}
-- DB currently has single-prefix: asahanta/listings/{uuid}/{file}  (404s!)
-- Convert DB URLs to double-prefix to match R2 storage
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
