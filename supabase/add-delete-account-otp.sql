-- Add delete_account to OTP type constraint
ALTER TABLE public.otps DROP CONSTRAINT IF EXISTS otps_type_check;
ALTER TABLE public.otps ADD CONSTRAINT otps_type_check CHECK (type IN ('signup', 'password_reset', 'profile_update', 'email_change', 'password_create', 'delete_account'));
