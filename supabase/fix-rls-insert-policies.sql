-- Comprehensive RLS fix — run this in Supabase SQL editor
-- After running: LOG OUT and LOG BACK IN as admin

-- ============================================================
-- 1. PUBLIC FORMS — Allow anonymous inserts
-- ============================================================

-- house_requests (public request form, no login required)
DROP POLICY IF EXISTS "Anyone can insert house requests" ON public.house_requests;
CREATE POLICY "Anyone can insert house requests" ON public.house_requests
  FOR INSERT WITH CHECK (true);

-- wifi_bookings (public wifi booking form, no login required)
DROP POLICY IF EXISTS "Anyone can insert wifi bookings" ON public.wifi_bookings;
CREATE POLICY "Anyone can insert wifi bookings" ON public.wifi_bookings
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- 2. ADMIN — JWT-based policies (fix-rls-recursion.sql pattern)
-- ============================================================

-- wifi_package_categories (admin insert when managing wifi packages)
DROP POLICY IF EXISTS "Admins can manage package categories" ON public.wifi_package_categories;
CREATE POLICY "Admins can manage package categories" ON public.wifi_package_categories
  FOR INSERT WITH CHECK (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- profiles — admin needs UPDATE to change user roles
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- profiles — admin needs DELETE to remove users
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- escrow_holds — admin needs UPDATE for treasury (release/refund/extend)
DROP POLICY IF EXISTS "Admins can update all escrow holds" ON public.escrow_holds;
CREATE POLICY "Admins can update all escrow holds" ON public.escrow_holds
  FOR UPDATE USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- ============================================================
-- 3. USER — Own-data policies for booking/payment flow
-- ============================================================

-- escrow_holds — users need INSERT to create escrow after payment
DROP POLICY IF EXISTS "Users can insert own escrow holds" ON public.escrow_holds;
CREATE POLICY "Users can insert own escrow holds" ON public.escrow_holds
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- transactions — users need INSERT to log payment at STK push + fund release
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- transactions — users need SELECT to check own transaction status
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

-- bookings — users need UPDATE to set escrow_hold_id + release_status
DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Users can update own bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- 4. ADMIN JWT METADATA
-- ============================================================

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'asehanta@gmail.com';

-- ============================================================
-- AFTER RUNNING: Log out and log back in as admin
-- so the JWT refreshes with the role metadata.
-- ============================================================
