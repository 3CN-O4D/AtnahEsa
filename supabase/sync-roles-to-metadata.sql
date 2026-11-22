-- Sync roles from public.profiles to auth.users metadata.
-- Run this AFTER flexible-user-roles.sql to make JWT-based RLS work for existing users.
UPDATE auth.users au
SET raw_user_meta_data = COALESCE(au.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role', p.role,
    'roles', CASE
      WHEN p.role = 'both' THEN '["hunter","lister"]'::jsonb
      WHEN p.role = 'admin' THEN '["admin"]'::jsonb
      ELSE jsonb_build_array(p.role)
    END
  )
FROM public.profiles p
WHERE au.id = p.id
  AND (
    au.raw_user_meta_data->>'role' IS DISTINCT FROM p.role
    OR au.raw_user_meta_data->'roles' IS NULL
  );
