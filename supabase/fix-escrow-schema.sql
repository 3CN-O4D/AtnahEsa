-- ============================================================================
-- Fix escrow_holds schema mismatch
-- escrow_holds.booking_id references bookings(id) but all payment flows
-- (Paywave, house-bookings) use house_bookings(id).
-- ============================================================================

-- Drop the wrong FK and add the correct one
ALTER TABLE public.escrow_holds DROP CONSTRAINT IF EXISTS escrow_holds_booking_id_fkey;

-- Add house_booking_id column that properly references house_bookings
ALTER TABLE public.escrow_holds ADD COLUMN IF NOT EXISTS house_booking_id UUID REFERENCES public.house_bookings(id) ON DELETE CASCADE;

-- Backfill: copy existing booking_id values to house_booking_id (they're the same UUIDs for house_bookings flow)
-- Note: old bookings table rows won't match house_bookings, so we only backfill where there's a match
UPDATE public.escrow_holds eh
SET house_booking_id = hb.id
FROM public.house_bookings hb
WHERE eh.booking_id = hb.id;

-- Update the check constraint
ALTER TABLE public.escrow_holds DROP CONSTRAINT IF EXISTS escrow_holds_status_check;
ALTER TABLE public.escrow_holds ADD CONSTRAINT escrow_holds_status_check
  CHECK (status IN ('held', 'released', 'refunded'));

-- Index for common queries
CREATE INDEX IF NOT EXISTS escrow_holds_house_booking_id_idx ON public.escrow_holds (house_booking_id);
CREATE INDEX IF NOT EXISTS escrow_holds_status_idx ON public.escrow_holds (status);
CREATE INDEX IF NOT EXISTS escrow_holds_held_until_idx ON public.escrow_holds (held_until);

-- Comment for documentation
COMMENT ON COLUMN public.escrow_holds.house_booking_id IS 'References house_bookings.id (used by Paywave/Tuma payment flows)';
COMMENT ON COLUMN public.escrow_holds.booking_id IS 'Legacy column, kept for backward compatibility with bookings table';
