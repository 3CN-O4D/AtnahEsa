-- ============================================================================
-- recover-rls.sql
-- EMERGENCY RECOVERY: Restores working RLS policies after the broken
-- fix-admin-rls-identity.sql DO block created overly broad admin_all_ policies
-- on every table, blocking non-admin users from reading listings, wifi, etc.
--
-- Run this in Supabase SQL Editor. It uses service_role bypass internally
-- via SECURITY DEFINER functions where needed.
-- ============================================================================

-- 1. Drop the broken admin_all_ policies created by fix-admin-rls-identity.sql DO block
DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'admin_all_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
            rec.policyname, rec.tablename);
    END LOOP;
END $$;

-- 2. Ensure is_admin() and current_user_role() exist (SECURITY DEFINER,
--    reads from public.profiles which is server-controlled)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();
    RETURN v_role = 'admin';
EXCEPTION
    WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();
    RETURN COALESCE(v_role, 'hunter');
EXCEPTION
    WHEN OTHERS THEN RETURN 'hunter';
END;
$$;

-- 3. PROFILES: allow users to read their own profile, admins to read all
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- 4. LISTINGS: public can read published/taken, uploaders own, admins all
DROP POLICY IF EXISTS "Anyone can view published listings" ON public.listings;
CREATE POLICY "Anyone can view published listings"
  ON public.listings FOR SELECT
  USING (status IN ('published', 'taken'));

DROP POLICY IF EXISTS "Uploaders can view own listings" ON public.listings;
CREATE POLICY "Uploaders can view own listings"
  ON public.listings FOR SELECT
  USING (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;
CREATE POLICY "Admins can view all listings"
  ON public.listings FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can insert listings" ON public.listings;
CREATE POLICY "Authenticated users can insert listings"
  ON public.listings FOR INSERT
  WITH CHECK (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "Uploaders can update own listings" ON public.listings;
CREATE POLICY "Uploaders can update own listings"
  ON public.listings FOR UPDATE
  USING (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "Admins can update any listing" ON public.listings;
CREATE POLICY "Admins can update any listing"
  ON public.listings FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete listings" ON public.listings;
CREATE POLICY "Admins can delete listings"
  ON public.listings FOR DELETE
  USING (public.is_admin());

-- 5. BOOKINGS: users own, admins all
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own bookings" ON public.bookings;
CREATE POLICY "Users can insert own bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
CREATE POLICY "Admins can view all bookings"
  ON public.bookings FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
CREATE POLICY "Admins can update bookings"
  ON public.bookings FOR UPDATE
  USING (public.is_admin());

-- 6. WIFI_PACKAGES: public read, admins write
DROP POLICY IF EXISTS "Anyone can read wifi packages" ON public.wifi_packages;
CREATE POLICY "Anyone can read wifi packages"
  ON public.wifi_packages FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert wifi packages" ON public.wifi_packages;
CREATE POLICY "Admins can insert wifi packages"
  ON public.wifi_packages FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update wifi packages" ON public.wifi_packages;
CREATE POLICY "Admins can update wifi packages"
  ON public.wifi_packages FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete wifi packages" ON public.wifi_packages;
CREATE POLICY "Admins can delete wifi packages"
  ON public.wifi_packages FOR DELETE
  USING (public.is_admin());

-- 7. WIFI_CATEGORIES: public read, admins write
DROP POLICY IF EXISTS "Anyone can read wifi categories" ON public.wifi_categories;
CREATE POLICY "Anyone can read wifi categories"
  ON public.wifi_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert wifi categories" ON public.wifi_categories;
CREATE POLICY "Admins can insert wifi categories"
  ON public.wifi_categories FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update wifi categories" ON public.wifi_categories;
CREATE POLICY "Admins can update wifi categories"
  ON public.wifi_categories FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete wifi categories" ON public.wifi_categories;
CREATE POLICY "Admins can delete wifi categories"
  ON public.wifi_categories FOR DELETE
  USING (public.is_admin());

-- 8. WIFI_PACKAGE_CATEGORIES
DROP POLICY IF EXISTS "Anyone can read package categories" ON public.wifi_package_categories;
CREATE POLICY "Anyone can read package categories"
  ON public.wifi_package_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage package categories" ON public.wifi_package_categories;
CREATE POLICY "Admins can manage package categories"
  ON public.wifi_package_categories FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete package categories" ON public.wifi_package_categories;
CREATE POLICY "Admins can delete package categories"
  ON public.wifi_package_categories FOR DELETE
  USING (public.is_admin());

-- 9. WIFI_BOOKINGS: public insert, admins read/update
DROP POLICY IF EXISTS "Anyone can insert wifi bookings" ON public.wifi_bookings;
CREATE POLICY "Anyone can insert wifi bookings"
  ON public.wifi_bookings FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view all wifi bookings" ON public.wifi_bookings;
CREATE POLICY "Admins can view all wifi bookings"
  ON public.wifi_bookings FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update wifi bookings" ON public.wifi_bookings;
CREATE POLICY "Admins can update wifi bookings"
  ON public.wifi_bookings FOR UPDATE
  USING (public.is_admin());

-- 10. CONTACT_SUBMISSIONS: public insert, admins read
DROP POLICY IF EXISTS "Anyone can insert contact submissions" ON public.contact_submissions;
CREATE POLICY "Anyone can insert contact submissions"
  ON public.contact_submissions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read contact submissions" ON public.contact_submissions;
CREATE POLICY "Admins can read contact submissions"
  ON public.contact_submissions FOR SELECT
  USING (public.is_admin());

-- 11. TRANSACTIONS: admins only
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert transactions" ON public.transactions;
CREATE POLICY "Admins can insert transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (public.is_admin());

-- 12. OTPS: service role only (no public access)
DROP POLICY IF EXISTS "Service role only" ON public.otps;
CREATE POLICY "Service role only"
  ON public.otps
  USING (false);

-- 13. ESCROW HOLDS: users own, admins all
DROP POLICY IF EXISTS "Users can view own escrow holds" ON public.escrow_holds;
CREATE POLICY "Users can view own escrow holds"
  ON public.escrow_holds FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own escrow holds" ON public.escrow_holds;
CREATE POLICY "Users can update own escrow holds"
  ON public.escrow_holds FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all escrow holds" ON public.escrow_holds;
CREATE POLICY "Admins can view all escrow holds"
  ON public.escrow_holds FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all escrow holds" ON public.escrow_holds;
CREATE POLICY "Admins can update all escrow holds"
  ON public.escrow_holds FOR UPDATE
  USING (public.is_admin());

-- 14. REPORTS
DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Users can insert own reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
CREATE POLICY "Admins can view all reports"
  ON public.reports FOR SELECT
  USING (public.is_admin());

-- 15. FLAGGED REPORTS
DROP POLICY IF EXISTS "Anyone can insert flagged_reports" ON public.flagged_reports;
CREATE POLICY "Anyone can insert flagged_reports"
  ON public.flagged_reports FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view all flagged_reports" ON public.flagged_reports;
CREATE POLICY "Admins can view all flagged_reports"
  ON public.flagged_reports FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update flagged_reports" ON public.flagged_reports;
CREATE POLICY "Admins can update flagged_reports"
  ON public.flagged_reports FOR UPDATE
  USING (public.is_admin());

-- 16. HOUSE REQUESTS: public insert, admins read/update
DROP POLICY IF EXISTS "Anyone can insert house requests" ON public.house_requests;
CREATE POLICY "Anyone can insert house requests"
  ON public.house_requests FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view house requests" ON public.house_requests;
CREATE POLICY "Admins can view house requests"
  ON public.house_requests FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update house requests" ON public.house_requests;
CREATE POLICY "Admins can update house requests"
  ON public.house_requests FOR UPDATE
  USING (public.is_admin());

-- 17. MOVERS: public read, admins write
DROP POLICY IF EXISTS "Anyone can read movers" ON public.movers;
CREATE POLICY "Anyone can read movers"
  ON public.movers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert movers" ON public.movers;
CREATE POLICY "Admins can insert movers"
  ON public.movers FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update movers" ON public.movers;
CREATE POLICY "Admins can update movers"
  ON public.movers FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete movers" ON public.movers;
CREATE POLICY "Admins can delete movers"
  ON public.movers FOR DELETE
  USING (public.is_admin());

-- 18. REVIEWS: public read, booked users insert
DROP POLICY IF EXISTS "Anyone can read reviews" ON public.reviews;
CREATE POLICY "Anyone can read reviews"
  ON public.reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Only booked users can insert reviews" ON public.reviews;
CREATE POLICY "Only booked users can insert reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.listing_id = reviews.listing_id
        AND bookings.user_id = auth.uid()
        AND bookings.release_status = 'released'
    )
  );

-- 19. LISTER_REVIEWS
DROP POLICY IF EXISTS "Anyone can read lister_reviews" ON public.lister_reviews;
CREATE POLICY "Anyone can read lister_reviews"
  ON public.lister_reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert lister_reviews" ON public.lister_reviews;
CREATE POLICY "Authenticated users can insert lister_reviews"
  ON public.lister_reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- 20. MOVER_REVIEWS
DROP POLICY IF EXISTS "Anyone can read mover_reviews" ON public.mover_reviews;
CREATE POLICY "Anyone can read mover_reviews"
  ON public.mover_reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert mover_reviews" ON public.mover_reviews;
CREATE POLICY "Authenticated users can insert mover_reviews"
  ON public.mover_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 21. Verify: audit query (should show 0 user_metadata policies)
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE qual LIKE '%user_metadata%' OR with_check LIKE '%user_metadata%';
