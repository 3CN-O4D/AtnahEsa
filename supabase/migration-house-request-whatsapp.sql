-- ============================================================
-- House request WhatsApp contact
-- Adds a preferred WhatsApp contact to each house request so staff
-- (and the lister who claimed it) can message the requester in one click.
-- Supports both phone numbers and WhatsApp usernames.
-- Run in the Supabase SQL Editor against the LIVE database.
-- ============================================================

ALTER TABLE public.house_requests
  ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT '';

-- Existing requests fall back to the phone number they already supplied.
UPDATE public.house_requests
SET whatsapp = phone
WHERE (whatsapp IS NULL OR btrim(whatsapp) = '')
  AND phone IS NOT NULL
  AND btrim(phone) <> '';

-- Keep the public, anonymised view unchanged: it must never expose
-- name/email/phone/whatsapp to listers browsing the request board.
COMMENT ON COLUMN public.house_requests.whatsapp IS
  'Preferred WhatsApp contact: phone number (2547...) or @username. Hidden from the public request view.';
