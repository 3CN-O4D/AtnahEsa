-- Normalize listing image URLs to the canonical single-prefix R2 layout.
-- Canonical key:  asehanta/listings/{user_id}/{file}
-- Legacy (bug):   asehanta/listings/{user_id}/asehanta/listings/{user_id}/{file}
--
-- The upload API used to store objects at the legacy double-prefixed key while
-- returning the single-prefixed URL, so new images 404'd and the DB/bucket
-- disagreed. The API now stores and returns the canonical key; this migration
-- rewrites any DB rows that still point at the double-prefixed layout.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

UPDATE public.listings
SET images = ARRAY(
  SELECT regexp_replace(
    img,
    '^(https://media\.asehanta\.com/asehanta/listings/)([^/]+)/asehanta/listings/([^/]+)/([^/]+)$',
    '\1\2/\4'
  )
  FROM unnest(images) AS img
)
WHERE array_length(images, 1) > 0
  AND EXISTS (
    SELECT 1
    FROM unnest(images) AS img
    WHERE img ~ '^https://media\.asehanta\.com/asehanta/listings/[^/]+/asehanta/listings/[^/]+/[^/]+$'
  );

-- Confirm results
SELECT id, title, images
FROM public.listings
WHERE array_length(images, 1) > 0;
