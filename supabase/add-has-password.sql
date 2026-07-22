-- Add has_password flag to profiles so we know whether to show
-- "Create Password" (first time) vs "Change Password" (subsequent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_password BOOLEAN DEFAULT false;

-- Backfill: users who signed up with email/password already have a password
UPDATE profiles SET has_password = true WHERE id IN (
  SELECT id FROM auth.users WHERE raw_app_meta_data->>'provider' = 'email'
);

-- Also set has_password for any user who has an email identity in auth (they have a password)
UPDATE profiles SET has_password = true WHERE id IN (
  SELECT DISTINCT user_id FROM auth.identities WHERE provider = 'email'
) AND has_password = false;

-- Update otps CHECK constraint to include new types
ALTER TABLE otps DROP CONSTRAINT IF EXISTS otps_type_check;
ALTER TABLE otps ADD CONSTRAINT otps_type_check CHECK (type IN ('signup', 'password_reset', 'password_create', 'profile_update', 'email_change'));
