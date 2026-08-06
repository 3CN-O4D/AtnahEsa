-- Tuma (I&M Bank) payment tracking
-- Adds merchant_request_id to transactions so Tuma callbacks can be correlated.

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS merchant_request_id TEXT DEFAULT '';

-- Keep both request ids indexed for fast callback lookups.
CREATE INDEX IF NOT EXISTS transactions_checkout_request_id_idx ON public.transactions (checkout_request_id);
CREATE INDEX IF NOT EXISTS transactions_merchant_request_id_idx ON public.transactions (merchant_request_id);
