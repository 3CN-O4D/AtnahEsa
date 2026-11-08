-- Add missing WiFi booking fee columns so both /api/wifi/book and the Ase
-- chatbot WiFi-booking flow can record the installation fee + first payment.
-- (Older databases never got these columns; the API route + chatbot both need them.)

ALTER TABLE public.wifi_bookings
  ADD COLUMN IF NOT EXISTS installation_fee INTEGER NOT NULL DEFAULT 2000;

ALTER TABLE public.wifi_bookings
  ADD COLUMN IF NOT EXISTS total_price INTEGER NOT NULL DEFAULT 0;

-- Backfill total_price for existing rows where the package price is known.
UPDATE public.wifi_bookings
SET total_price = installation_fee + COALESCE(package_price, 0)
WHERE total_price = 0 AND package_price > 0;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
