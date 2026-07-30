-- Delete all movers
DELETE FROM public.mover_reviews;
DELETE FROM public.movers;

-- Clean up expired/used OTPs (keep only unused ones that haven't expired)
DELETE FROM public.otps WHERE used = TRUE OR expires_at < NOW();
