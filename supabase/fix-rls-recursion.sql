-- Fix RLS infinite recursion
-- Run this ONCE in Supabase SQL Editor (no need to drop/recreate schema)

-- 1. Create the security definer function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop old recursive policies and recreate with is_admin()
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can update any listing" ON public.listings;
DROP POLICY IF EXISTS "Admins can delete listings" ON public.listings;
CREATE POLICY "Admins can view all listings" ON public.listings FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update any listing" ON public.listings FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete listings" ON public.listings FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
CREATE POLICY "Admins can view all bookings" ON public.bookings FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update bookings" ON public.bookings FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert movers" ON public.movers;
DROP POLICY IF EXISTS "Admins can update movers" ON public.movers;
DROP POLICY IF EXISTS "Admins can delete movers" ON public.movers;
CREATE POLICY "Admins can insert movers" ON public.movers FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update movers" ON public.movers FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete movers" ON public.movers FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert wifi packages" ON public.wifi_packages;
DROP POLICY IF EXISTS "Admins can update wifi packages" ON public.wifi_packages;
DROP POLICY IF EXISTS "Admins can delete wifi packages" ON public.wifi_packages;
CREATE POLICY "Admins can insert wifi packages" ON public.wifi_packages FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update wifi packages" ON public.wifi_packages FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete wifi packages" ON public.wifi_packages FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all wifi bookings" ON public.wifi_bookings;
DROP POLICY IF EXISTS "Admins can update wifi bookings" ON public.wifi_bookings;
CREATE POLICY "Admins can view all wifi bookings" ON public.wifi_bookings FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update wifi bookings" ON public.wifi_bookings FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can read contact submissions" ON public.contact_submissions;
CREATE POLICY "Admins can read contact submissions" ON public.contact_submissions FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert transactions" ON public.transactions FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all escrow holds" ON public.escrow_holds;
CREATE POLICY "Admins can view all escrow holds" ON public.escrow_holds FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all flagged_reports" ON public.flagged_reports;
DROP POLICY IF EXISTS "Admins can update flagged_reports" ON public.flagged_reports;
CREATE POLICY "Admins can view all flagged_reports" ON public.flagged_reports FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update flagged_reports" ON public.flagged_reports FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert wifi categories" ON public.wifi_categories;
DROP POLICY IF EXISTS "Admins can update wifi categories" ON public.wifi_categories;
DROP POLICY IF EXISTS "Admins can delete wifi categories" ON public.wifi_categories;
CREATE POLICY "Admins can insert wifi categories" ON public.wifi_categories FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update wifi categories" ON public.wifi_categories FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete wifi categories" ON public.wifi_categories FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage package categories" ON public.wifi_package_categories;
DROP POLICY IF EXISTS "Admins can delete package categories" ON public.wifi_package_categories;
CREATE POLICY "Admins can manage package categories" ON public.wifi_package_categories FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete package categories" ON public.wifi_package_categories FOR DELETE USING (public.is_admin());
