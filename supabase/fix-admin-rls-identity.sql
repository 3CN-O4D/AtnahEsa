-- ============================================================================
-- fix-admin-rls-identity.sql
-- CRITICAL (C-A): Replace user_metadata-based admin RLS with server-controlled
-- public.profiles.role via SECURITY DEFINER functions.
--
-- user_metadata is client-controllable: any signed-in user can call
-- supabase.auth.updateUser({ data: { role: 'admin' } }) and bypass every
-- admin policy that checks auth.jwt() -> 'user_metadata' ->> 'role'.
--
-- Run this LAST, after all other RLS migrations. Re-running an old migration
-- afterwards would reintroduce the flaw.
-- ============================================================================

-- 1. Server-controlled admin identity function (SECURITY DEFINER)
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

-- 2. Server-controlled current user role (for notification targeting)
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

-- 3. Drop and recreate admin policies on all tables using is_admin()
--    (add tables as your schema evolves)

DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS admin_all_%I ON public.%I',
            rec.tablename, rec.tablename
        );
        EXECUTE format(
            'CREATE POLICY admin_all_%I ON public.%I
             FOR ALL TO authenticated
             USING (public.is_admin()) WITH CHECK (public.is_admin())',
            rec.tablename, rec.tablename
        );
    END LOOP;
END $$;

-- 4. Deprecate old migration files (mark them as superseded)
--    See supabase/fix-rls-recursion.sql and fix-rls-insert-policies.sql

-- 5. Audit query (expected 0 rows after fix):
--    SELECT schemaname, tablename, policyname, cmd
--    FROM pg_policies
--    WHERE qual LIKE '%user_metadata%' OR with_check LIKE '%user_metadata%';

-- 6. Verify admins:
--    SELECT id, email, role FROM public.profiles WHERE role = 'admin';
