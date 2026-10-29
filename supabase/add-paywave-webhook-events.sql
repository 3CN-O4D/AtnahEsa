-- ============================================================================
-- Paywave webhook idempotency table
-- Tracks processed webhook events to prevent duplicate processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.paywave_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_request_id TEXT NOT NULL UNIQUE,
  event TEXT NOT NULL,
  amount TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB
);

ALTER TABLE public.paywave_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write webhook events
CREATE POLICY "Service role only" ON public.paywave_webhook_events
  FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS paywave_webhook_events_checkout_idx ON public.paywave_webhook_events (checkout_request_id);
CREATE INDEX IF NOT EXISTS paywave_webhook_events_received_at_idx ON public.paywave_webhook_events (received_at);
