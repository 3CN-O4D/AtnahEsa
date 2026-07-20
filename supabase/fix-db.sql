-- ============================================================
-- AseHanta DB Fix Script
-- Run this in Supabase SQL Editor after pasting schema-clean.sql
-- ============================================================

-- Allow profile_update type in OTPs check constraint
ALTER TABLE public.otps DROP CONSTRAINT IF EXISTS otps_type_check;
ALTER TABLE public.otps ADD CONSTRAINT otps_type_check CHECK (type IN ('signup', 'password_reset', 'profile_update'));

-- 1. Add missing wifi tables (if not already in schema-clean)
CREATE TABLE IF NOT EXISTS public.wifi_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'Wifi',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.wifi_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.wifi_package_categories (
  package_id UUID REFERENCES public.wifi_packages(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.wifi_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, category_id)
);
ALTER TABLE public.wifi_package_categories ENABLE ROW LEVEL SECURITY;

-- 2. Seed wifi categories
INSERT INTO public.wifi_categories (name, description, color, display_order) VALUES
  ('Home Packages', 'High-speed internet for your home', '#2563EB', 1),
  ('Device Plans', 'Perfect for individual devices', '#059669', 2)
ON CONFLICT DO NOTHING;

-- 3. Seed wifi packages (Jambonet)
INSERT INTO public.wifi_packages (name, provider, speed, price, description, features, original_price, category) VALUES
  ('Jambonet 5 Mbps', 'Jambonet Kenya', '5 Mbps', 1500, 'Perfect for browsing, email, and social media', ARRAY['Up to 5 Mbps download', 'Unlimited data', 'Free standard installation'], 2000, 'home'),
  ('Jambonet 10 Mbps', 'Jambonet Kenya', '10 Mbps', 2500, 'Great for streaming and working from home', ARRAY['Up to 10 Mbps download', 'Unlimited data', 'Free WiFi router', 'Free installation'], 3500, 'home'),
  ('Jambonet 20 Mbps', 'Jambonet Kenya', '20 Mbps', 4000, 'High-speed for the whole family — 4K ready', ARRAY['Up to 20 Mbps download', 'Unlimited data', 'Free WiFi router', 'Priority support'], 5500, 'home'),
  ('Jambonet 30 Mbps', 'Jambonet Kenya', '30 Mbps', 5000, 'Heavy streaming, gaming & multiple devices', ARRAY['Up to 30 Mbps download', 'Unlimited data', 'Free WiFi 6 router', '48hr installation guarantee'], 7000, 'home')
ON CONFLICT DO NOTHING;

-- 4. Link packages to categories
INSERT INTO public.wifi_package_categories (package_id, category_id)
SELECT p.id, c.id FROM public.wifi_packages p, public.wifi_categories c
WHERE c.name = 'Home Packages'
AND p.name LIKE 'Jambonet%'
ON CONFLICT DO NOTHING;

-- 5. Create/update admin profile for asehanta@gmail.com
INSERT INTO public.profiles (id, username, full_name, phone, role, terms_accepted)
SELECT id, 'asehanta', 'AseHanta Admin', '', 'admin', true
FROM auth.users
WHERE email = 'asehanta@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', terms_accepted = true;

-- 5b. Update auth.users metadata so the JWT includes role = 'admin' (required for RLS policies)
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'asehanta@gmail.com';

-- 6. Restore schema-level grants (lost after DROP SCHEMA public CASCADE)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- 7. Verify admin profile was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.email = 'asehanta@gmail.com' AND p.role = 'admin'
  ) THEN
    RAISE NOTICE 'Admin profile OK for asehanta@gmail.com';
  ELSE
    RAISE WARNING 'Admin profile NOT FOUND for asehanta@gmail.com — check auth.users email';
  END IF;
END $$;
