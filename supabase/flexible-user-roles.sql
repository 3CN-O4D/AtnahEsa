-- ============================================================
-- flexible-user-roles.sql
-- Let one account be a hunter, a lister, or both.
--
-- Run this in the Supabase SQL Editor. The app already works with the legacy
-- single-role values; this migration adds the explicit "both" value and lets
-- users change their own selection after OTP verification.
-- ============================================================

-- 1. Allow the explicit combined role in the legacy column.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('hunter', 'lister', 'both', 'admin'));

-- 2. Keep auth JWT metadata in sync for existing users.
UPDATE auth.users au
SET raw_user_meta_data = jsonb_set(
  COALESCE(au.raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  CASE
    WHEN p.role = 'both' THEN '["hunter","lister"]'::jsonb
    WHEN p.role = 'admin' THEN '["admin"]'::jsonb
    ELSE jsonb_build_array(p.role)
  END,
  true
)
FROM public.profiles p
WHERE au.id = p.id;

-- 3. Allow self-service role changes between hunter/lister/both, but never
--    let a non-admin become an admin (or demote an admin).
CREATE OR REPLACE FUNCTION public.guard_profiles_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'dashboard_user') THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_role, '') = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() <> NEW.id
       OR OLD.role = 'admin'
       OR NEW.role NOT IN ('hunter', 'lister', 'both') THEN
      RAISE EXCEPTION 'You are not allowed to change your role';
    END IF;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.average_rating IS DISTINCT FROM OLD.average_rating
     OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews THEN
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

-- 4. Broadcast notifications addressed to hunter or lister should reach a
--    user whose JWT role is "both".
DROP POLICY IF EXISTS "Users can view own and broadcast notifications" ON public.notifications;
CREATE POLICY "Users can view own and broadcast notifications" ON public.notifications
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      user_id IS NULL
      AND (
        role = ''
        OR role = (auth.jwt() -> 'user_metadata' ->> 'role')
        OR (
          auth.jwt() -> 'user_metadata' ->> 'role' = 'both'
          AND role IN ('hunter', 'lister')
        )
      )
    )
  );
