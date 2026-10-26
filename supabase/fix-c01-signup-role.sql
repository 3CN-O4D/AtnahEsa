-- ============================================================================
-- fix-c01-signup-role.sql
-- CRITICAL (C-01): Ensure signup trigger assigns correct default role and
-- that profiles.email column exists and is backfilled from auth.users.
-- ============================================================================

-- 1. Ensure profiles.email column exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill email from auth.users for existing profiles
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE p.id = au.id
  AND (p.email IS NULL OR p.email = '');

-- 3. Ensure handle_new_user uses server-side role assignment (not client-controlled)
--    The trigger should insert with role = 'hunter' (or 'lister' if explicitly
--    requested via a separate, vetted flow), never from user_metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id, email, full_name, username, phone, role,
        terms_accepted, avatar_url, average_rating, total_reviews,
        has_password, verified, created_at, updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'username', ''),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        'hunter',  -- server-controlled default; never trust client role
        COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false),
        NULL,
        0,
        0,
        false,
        false,
        NOW(),
        NOW()
    );
    RETURN NEW;
END;
$$;

-- 4. Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
