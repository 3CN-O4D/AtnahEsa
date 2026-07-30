-- Add email column to profiles (safe to run if already exists)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
UPDATE public.profiles SET email = au.email
FROM auth.users au
WHERE profiles.id = au.id AND profiles.email = '';
