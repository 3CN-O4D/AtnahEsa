-- ============================================================
-- In-app notifications + lister payment visibility
-- ------------------------------------------------------------
-- 1. notifications table (adverts, new houses, transactions,
--    linking details, system events). user_id NULL = broadcast
--    (optionally targeted at a role). RLS lets each user read
--    their own + matching broadcasts and mark their own read.
-- 2. house_bookings policy: listers may read payments made on
--    houses they uploaded (so "Bookings on My Houses" can show
--    hunter contact + escrow status).
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- --- 1. notifications table ---
-- NOTE: CREATE TABLE IF NOT EXISTS is a no-op if the table already
-- exists, so we add missing columns explicitly to stay idempotent.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  data JSONB DEFAULT '{}',
  is_broadcast BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS role TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON public.notifications (created_at DESC);

DROP POLICY IF EXISTS "Users can view own and broadcast notifications" ON public.notifications;
CREATE POLICY "Users can view own and broadcast notifications" ON public.notifications
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      user_id IS NULL
      AND (role = '' OR role = (auth.jwt() -> 'user_metadata' ->> 'role'))
    )
  );

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
CREATE POLICY "Users can mark own notifications read" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;
CREATE POLICY "Admins can manage notifications" ON public.notifications
  FOR ALL USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

-- --- 2. listers can read payments on their own listings ---
DROP POLICY IF EXISTS "Listers can view payments on their houses" ON public.house_bookings;
CREATE POLICY "Listers can view payments on their houses" ON public.house_bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = house_bookings.listing_id
        AND l.uploader_id = auth.uid()
    )
  );
