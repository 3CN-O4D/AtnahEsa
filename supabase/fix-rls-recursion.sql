-- Fix RLS infinite recursion
-- Replaces the recursive subquery (SELECT id FROM profiles WHERE role = 'admin')
-- with a direct check on auth.users.raw_user_meta_data (no recursion)

-- 1. Drop ALL old admin policies (they all used the recursive subquery)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can update any listing" ON public.listings;
DROP POLICY IF EXISTS "Admins can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can insert movers" ON public.movers;
DROP POLICY IF EXISTS "Admins can update movers" ON public.movers;
DROP POLICY IF EXISTS "Admins can delete movers" ON public.movers;
DROP POLICY IF EXISTS "Admins can insert wifi packages" ON public.wifi_packages;
DROP POLICY IF EXISTS "Admins can update wifi packages" ON public.wifi_packages;
DROP POLICY IF EXISTS "Admins can delete wifi packages" ON public.wifi_packages;
DROP POLICY IF EXISTS "Admins can view all wifi bookings" ON public.wifi_bookings;
DROP POLICY IF EXISTS "Admins can update wifi bookings" ON public.wifi_bookings;
DROP POLICY IF EXISTS "Admins can read contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can view all escrow holds" ON public.escrow_holds;
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
DROP POLICY IF EXISTS "Admins can view all flagged_reports" ON public.flagged_reports;
DROP POLICY IF EXISTS "Admins can update flagged_reports" ON public.flagged_reports;
DROP POLICY IF EXISTS "Admins can insert wifi categories" ON public.wifi_categories;
DROP POLICY IF EXISTS "Admins can update wifi categories" ON public.wifi_categories;
DROP POLICY IF EXISTS "Admins can delete wifi categories" ON public.wifi_categories;
DROP POLICY IF EXISTS "Admins can manage package categories" ON public.wifi_package_categories;
DROP POLICY IF EXISTS "Admins can delete package categories" ON public.wifi_package_categories;

-- 2. Update admin's auth.users metadata to include role (so JWT-based check works)
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'asehanta@gmail.com';

-- 3. Recreate all admin policies using auth.jwt() -> user_metadata (no recursion)
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all listings" ON public.listings FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can update any listing" ON public.listings FOR UPDATE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can delete listings" ON public.listings FOR DELETE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all bookings" ON public.bookings FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can update bookings" ON public.bookings FOR UPDATE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can insert movers" ON public.movers FOR INSERT WITH CHECK (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can update movers" ON public.movers FOR UPDATE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can delete movers" ON public.movers FOR DELETE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can insert wifi packages" ON public.wifi_packages FOR INSERT WITH CHECK (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can update wifi packages" ON public.wifi_packages FOR UPDATE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can delete wifi packages" ON public.wifi_packages FOR DELETE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all wifi bookings" ON public.wifi_bookings FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can update wifi bookings" ON public.wifi_bookings FOR UPDATE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can read contact submissions" ON public.contact_submissions FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can insert transactions" ON public.transactions FOR INSERT WITH CHECK (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all escrow holds" ON public.escrow_holds FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all flagged_reports" ON public.flagged_reports FOR SELECT USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can update flagged_reports" ON public.flagged_reports FOR UPDATE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can insert wifi categories" ON public.wifi_categories FOR INSERT WITH CHECK (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can update wifi categories" ON public.wifi_categories FOR UPDATE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can delete wifi categories" ON public.wifi_categories FOR DELETE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);

CREATE POLICY "Admins can manage package categories" ON public.wifi_package_categories FOR INSERT WITH CHECK (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "Admins can delete package categories" ON public.wifi_package_categories FOR DELETE USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
