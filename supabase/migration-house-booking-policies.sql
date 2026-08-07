-- ============================================================
-- House bookings RLS: hunters must be able to READ their own
-- bookings so the "Payments" tab in My Bookings works.
--
-- Currently only INSERT (public) and SELECT (admins only) exist,
-- so a hunter can never see their own paid booking. Add a
-- SELECT-own policy and re-assert the admin read-all policy.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- Hunters can read their own house bookings (payments tab).
DROP POLICY IF EXISTS "Hunters can view own house bookings" ON public.house_bookings;
CREATE POLICY "Hunters can view own house bookings" ON public.house_bookings
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can read all house bookings (re-assert, idempotent).
DROP POLICY IF EXISTS "Admins can view house bookings" ON public.house_bookings;
CREATE POLICY "Admins can view house bookings" ON public.house_bookings
  FOR SELECT USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- Hunters can update their own booking (confirm / rate / displeased).
DROP POLICY IF EXISTS "Hunters can update own house bookings" ON public.house_bookings;
CREATE POLICY "Hunters can update own house bookings" ON public.house_bookings
  FOR UPDATE USING (auth.uid() = user_id);
