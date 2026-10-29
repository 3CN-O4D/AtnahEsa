-- Add missing columns to house_bookings for PayWave payment flow
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'paywave';
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'pending' CHECK (release_status IN ('pending', 'held', 'released', 'refunded', 'refund_requested', 'rejected'));
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS mpesa_receipt TEXT;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Allow hunters to insert their own bookings (needed for payment flow)
DROP POLICY IF EXISTS "Hunters can insert own house bookings" ON public.house_bookings;
CREATE POLICY "Hunters can insert own house bookings" ON public.house_bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow hunters to update their own bookings (confirm, release, refund)
DROP POLICY IF EXISTS "Hunters can update own house bookings" ON public.house_bookings;
CREATE POLICY "Hunters can update own house bookings" ON public.house_bookings
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow listers to read bookings on their listings
DROP POLICY IF EXISTS "Listers can view payments on their houses" ON public.house_bookings;
CREATE POLICY "Listers can view payments on their houses" ON public.house_bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = house_bookings.listing_id AND l.uploader_id = auth.uid())
  );

-- Create paywave webhook events table for idempotency
CREATE TABLE IF NOT EXISTS public.paywave_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_request_id TEXT NOT NULL,
  event TEXT NOT NULL,
  amount INTEGER,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB
);

ALTER TABLE public.paywave_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.paywave_webhook_events;
CREATE POLICY "Service role only" ON public.paywave_webhook_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE INDEX IF NOT EXISTS paywave_webhook_events_checkout_idx ON public.paywave_webhook_events (checkout_request_id);
CREATE INDEX IF NOT EXISTS paywave_webhook_events_received_at_idx ON public.paywave_webhook_events (received_at);
