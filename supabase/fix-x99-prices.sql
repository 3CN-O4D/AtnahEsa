-- Exact-price repair: legacy listings were seeded ending in 99 (499, 699, ...)
-- while the payable amount must equal the listing price in whole shillings.
-- This bumps every legacy "...99" price by KES 1 and keeps pending house
-- bookings in sync so the same listing always shows the same amount.

UPDATE listings
SET price = price + 1
WHERE price % 100 = 99;

-- Pending bookings have no money attached yet (no transaction row), so align
-- their stored amount with the corrected listing price. Never touch paid ones.
UPDATE house_bookings hb
SET listing_price = l.price
FROM listings l
WHERE hb.listing_id = l.id
  AND hb.status = 'pending'
  AND hb.release_status = 'pending'
  AND hb.listing_price <> l.price;
