-- Daraja Transaction Status Verification & B2C Refunds
-- Adds 'verifying' status to bookings and transactions
-- Adds RLS policy for users to insert their own transactions
-- Adds RLS policy for users to update their own transactions (for callback)

-- 1. Add 'verifying' to bookings status check
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'verifying', 'confirmed', 'cancelled', 'refunded'));

-- 2. Add 'verifying' to transactions status check
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending', 'verifying', 'success', 'failed'));

-- 3. Add originator_conversation_id to transactions for tracking status query
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS originator_conversation_id TEXT DEFAULT '';

-- 4. Add listing_id to transactions for callback context
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;

-- 5. Allow users to insert their own transactions
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. Allow users to update their own transactions (for status polling display)
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id);

-- 7. Allow the service_role (callback) to manage all transactions
-- Already handled via service_role bypass
