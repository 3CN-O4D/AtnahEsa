-- Fix: confirmed_at must mean "hunter gave feedback", not "payment arrived".
--
-- Several payment paths used to set house_bookings.confirmed_at when escrow
-- opened. The hunter feedback UI and the admin payout/refund queues all key off
-- confirmed_at, so those bookings looked already confirmed: no feedback buttons
-- for the hunter, and no "awaiting confirmation" state for admins.
--
-- Writers are fixed in application code. This migration repairs rows already
-- written: a genuine feedback submission always stores serialized feedback in
-- displeased_reason and a 1-5 rating. Rows with confirmed_at but neither are
-- payment-time leftovers and are safe to clear.

UPDATE public.house_bookings
SET confirmed_at = NULL
WHERE confirmed_at IS NOT NULL
  AND (displeased_reason IS NULL OR btrim(displeased_reason) = '')
  AND rating IS NULL;

-- paid_at remains untouched: it records when the money actually arrived.
