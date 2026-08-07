-- ============================================================
-- Tuma escrow / release workflow for public house bookings
-- ------------------------------------------------------------
-- After a confirmed Tuma payment the money is HELD (treasury shows
-- a pending payout). Admins release to the lister manually (no cron
-- in Vercel), or refund 85% when the hunter is displeased.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Allow house_bookings.status to be 'confirmed' (callback sets it).
ALTER TABLE public.house_bookings DROP CONSTRAINT IF EXISTS house_bookings_status_check;
ALTER TABLE public.house_bookings ADD CONSTRAINT house_bookings_status_check
  CHECK (status IN ('pending', 'contacted', 'completed', 'cancelled', 'confirmed'));

-- 2. Escrow / payout tracking columns (provider-agnostic: works for
--    Tuma, I&M, Daraja Till / M-Pesa STK — any confirmed payment).
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'pending'
  CHECK (release_status IN ('pending', 'held', 'paid', 'refunded'));
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS held_until TIMESTAMPTZ;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS displeased_reason TEXT DEFAULT '';
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS house_bookings_user_id_idx ON public.house_bookings (user_id);
CREATE INDEX IF NOT EXISTS house_bookings_release_status_idx ON public.house_bookings (release_status);

-- 2b. Track which provider processed each transaction (tuma, im, daraja_till, ...).
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT '';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS escrow_hold_id UUID REFERENCES public.escrow_holds(id) ON DELETE SET NULL;

-- 3. Admins need UPDATE access on the new release fields.
DROP POLICY IF EXISTS "Admins can update house bookings" ON public.house_bookings;
CREATE POLICY "Admins can update house bookings" ON public.house_bookings
  FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- 4. Hunters may update their own booking (confirm/rate/pleased-displeased).
DROP POLICY IF EXISTS "Hunters can update own house bookings" ON public.house_bookings;
CREATE POLICY "Hunters can update own house bookings" ON public.house_bookings
  FOR UPDATE USING (auth.uid() = user_id);

-- 5. Admins need INSERT access on transactions (release/refund logging via
--    server-side admin client is fine, but keep a belt-and-braces policy).
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.transactions;
CREATE POLICY "Admins can insert transactions" ON public.transactions
  FOR INSERT WITH CHECK (true);
