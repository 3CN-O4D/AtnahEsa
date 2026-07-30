-- ============================================================
-- New changes for AseHanta
-- Run this in Supabase SQL Editor after the main schema
-- ============================================================

-- 1. Verified badge for listers (admin can toggle)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

-- 2. Taken house: record who took it
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS taken_by_name TEXT DEFAULT '';

-- 3. Allow all OTP types used in the app
ALTER TABLE public.otps DROP CONSTRAINT IF EXISTS otps_type_check;
ALTER TABLE public.otps ADD CONSTRAINT otps_type_check CHECK (type IN ('signup', 'password_reset', 'password_create', 'email_change', 'profile_update', 'delete_account'));
