-- AseHanta status compatibility migration
-- Run once in Supabase SQL Editor. Safe to re-run.
-- Expands CHECK constraints to every status the app can write, including
-- refund_requested / rejected / released / cancelled and the transaction
-- review statuses. Existing rows are never deleted.

-- 1. house_bookings.release_status ------------------------------------------------
ALTER TABLE public.house_bookings
  ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'pending';

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.house_bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%release_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.house_bookings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.house_bookings
  ADD CONSTRAINT house_bookings_release_status_check
  CHECK (release_status IN (
    'pending', 'held', 'paid', 'released',
    'refund_requested', 'rejected', 'refunded', 'cancelled'
  ));

-- 2. bookings.release_status ------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'pending';

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%release_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_release_status_check
  CHECK (release_status IN (
    'pending', 'held', 'paid', 'released',
    'refund_requested', 'rejected', 'refunded', 'cancelled'
  ));

-- 3. transactions.status ----------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status IN (
    'pending', 'verifying', 'under_review', 'success', 'verified',
    'failed', 'refunded', 'cancelled'
  ));

-- 4. house_bookings.status --------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.house_bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%release_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.house_bookings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.house_bookings
  ADD CONSTRAINT house_bookings_status_check
  CHECK (status IN (
    'pending', 'contacted', 'confirmed', 'completed',
    'cancelled', 'refunded', 'under_review'
  ));

-- 5. bookings.status --------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%release_status%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%visit_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending', 'verifying', 'confirmed', 'contacted',
    'completed', 'cancelled', 'refunded'
  ));

-- Done. Refresh the app after running: admin stats and My Escrow read live values.
