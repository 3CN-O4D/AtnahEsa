-- Sync roles from public.profiles to auth.users metadata
-- Run this AFTER fix-rls-recursion.sql to make JWT-based RLS work for existing users
UPDATE auth.users au
SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', p.role)
FROM public.profiles p
WHERE au.id = p.id
  AND (au.raw_user_meta_data->>'role' IS NULL OR au.raw_user_meta_data->>'role' != p.role);
