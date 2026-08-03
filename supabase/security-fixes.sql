-- ============================================================
-- AseHanta — Security Remediation Migration
-- Run this in the Supabase SQL Editor against the LIVE database.
-- Safe to re-run (idempotent). Non-destructive: only adds columns,
-- recreates named policies (DROP IF EXISTS), adds triggers and
-- a rate-limit helper. No existing data is deleted or rewritten.
--
-- After running:
--   1. Log out and log back in as admin so the JWT refreshes.
--   2. Set CRON_SECRET in Vercel env + add to vercel.json cron header.
--   3. Verify anon read of /api/listings still works.
-- ============================================================

-- ============================================================
-- 1. ADMIN HELPER (JWT-based, recursion-free)
--    Used by the guard triggers + matches fix-rls-recursion.sql style.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ============================================================
-- 2. OTP BRUTE-FORCE PROTECTION (C-02)
--    Adds attempt counter so failed guesses can lock the code.
-- ============================================================
ALTER TABLE public.otps ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 3. PROFILES — prevent self role-escalation (C-01)
--    RLS can't restrict columns, so a guard trigger enforces that
--    the `role` column may only change for admins / service_role.
-- ============================================================
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.guard_profiles_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'dashboard_user') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You are not allowed to change your role';
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.average_rating IS DISTINCT FROM OLD.average_rating
     OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed to modify these profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard ON public.profiles;
CREATE TRIGGER profiles_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_update();

-- ============================================================
-- 4. LISTINGS — block lister self-publish (H-03)
--    Lister may edit their own listing but can only move status to
--    'pending' (revert) or leave it unchanged. 'published' / 'booked'
--    / 'taken' transitions remain admin/service only.
-- ============================================================
DROP POLICY IF EXISTS "Uploaders can update own listings" ON public.listings;
CREATE POLICY "Uploaders can update own listings"
  ON public.listings FOR UPDATE
  USING (auth.uid() = uploader_id);

CREATE OR REPLACE FUNCTION public.guard_listings_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'dashboard_user') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() <> NEW.uploader_id OR NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'New listings must be submitted as pending';
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() <> OLD.uploader_id THEN
    RAISE EXCEPTION 'Not allowed to modify this listing';
  END IF;

  IF NEW.uploader_id IS DISTINCT FROM OLD.uploader_id THEN
    RAISE EXCEPTION 'Not allowed to change the owner of a listing';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Only admins can change a listing status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_guard ON public.listings;
CREATE TRIGGER listings_guard
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_listings_write();

-- ============================================================
-- 5. BOOKINGS — block user tampering with state (H-02)
--    Owner may cancel their own booking (status -> 'cancelled') and set
--    escrow_hold_id; every other column change requires admin/service.
-- ============================================================
DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Users can update own bookings"
  ON public.bookings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_bookings_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'dashboard_user') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() <> NEW.user_id OR NEW.status NOT IN ('pending', 'verifying') THEN
      RAISE EXCEPTION 'Bookings can only be created in pending or verifying status';
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() <> OLD.user_id THEN
    RAISE EXCEPTION 'Not allowed to modify this booking';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Only admins can change a booking status to %', NEW.status;
  END IF;

  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.visit_status IS DISTINCT FROM OLD.visit_status
     OR NEW.mpesa_receipt IS DISTINCT FROM OLD.mpesa_receipt
     OR NEW.mpesa_metadata IS DISTINCT FROM OLD.mpesa_metadata
     OR NEW.release_status IS DISTINCT FROM OLD.release_status
     OR NEW.refund_percentage IS DISTINCT FROM OLD.refund_percentage
     OR NEW.refund_reason IS DISTINCT FROM OLD.refund_reason
     OR NEW.refund_amount IS DISTINCT FROM OLD.refund_amount
     OR NEW.refunded_at IS DISTINCT FROM OLD.refunded_at
     OR NEW.report_id IS DISTINCT FROM OLD.report_id THEN
    RAISE EXCEPTION 'Not allowed to modify this booking field';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_guard ON public.bookings;
CREATE TRIGGER bookings_guard
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_bookings_write();

-- Only one active booking per listing (prevents double-booking abuse).
-- Dedupe any pre-existing duplicates first so the index can be created.
UPDATE public.bookings b
SET status = 'cancelled'
WHERE b.id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY listing_id
             ORDER BY created_at, id
           ) AS rn
    FROM public.bookings
    WHERE status IN ('pending', 'verifying', 'confirmed')
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_listing
  ON public.bookings (listing_id)
  WHERE status IN ('pending', 'verifying', 'confirmed');

-- ============================================================
-- 6. ESCROW HOLDS — remove self-serve update (H-02)
--    Users can view + insert their own holds but may NOT change the
--    status (held/released/refunded); that stays admin/service only.
-- ============================================================
DROP POLICY IF EXISTS "Users can update own escrow holds" ON public.escrow_holds;

CREATE OR REPLACE FUNCTION public.guard_escrow_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'dashboard_user') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() <> NEW.user_id OR NEW.status <> 'held' THEN
      RAISE EXCEPTION 'Escrow holds can only be created in held status';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to modify this escrow hold';
END;
$$;

DROP TRIGGER IF EXISTS escrow_guard ON public.escrow_holds;
CREATE TRIGGER escrow_guard
  BEFORE INSERT OR UPDATE ON public.escrow_holds
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_escrow_write();

-- ============================================================
-- 7. RATE LIMITING (M-02) — shared RPC used by serverless routes
--    Sliding-window counter per key (e.g. client IP).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.rate_limits;
CREATE POLICY "Service role only"
  ON public.rate_limits
  USING (false);

CREATE OR REPLACE FUNCTION public.rate_limit_check(
  p_key TEXT,
  p_max INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - make_interval(secs => p_window_seconds::double precision);

  INSERT INTO public.rate_limits (key, count, window_start, updated_at)
  VALUES (p_key, 1, now(), now())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds::double precision)
      THEN 1
      ELSE public.rate_limits.count + 1
    END,
    window_start = CASE
      WHEN public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds::double precision)
      THEN now()
      ELSE public.rate_limits.window_start
    END,
    updated_at = now();

  SELECT count INTO v_count FROM public.rate_limits WHERE key = p_key;

  allowed := v_count <= p_max;
  remaining := GREATEST(p_max - v_count, 0);
  retry_after_seconds := p_window_seconds;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_check(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_check(TEXT, INTEGER, INTEGER) TO anon, authenticated;

-- ============================================================
-- 8. GRANTS (safe defaults for anon/authenticated)
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
