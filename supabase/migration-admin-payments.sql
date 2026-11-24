-- Admin-managed treasury payments.
--
-- One ledger for off-website cash/M-Pesa/till payments AND escrow movements
-- (holds, payouts, refunds, commission). Records are soft-deleted so the money
-- trail survives edits. Only server-side admin APIs may touch this table.

CREATE TABLE IF NOT EXISTS public.admin_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  house_booking_id UUID REFERENCES public.house_bookings(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,

  payer_name TEXT NOT NULL DEFAULT '',
  payer_phone TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL DEFAULT 'in'
    CHECK (direction IN ('in', 'out')),
  payment_type TEXT NOT NULL DEFAULT 'booking'
    CHECK (payment_type IN ('booking', 'escrow_hold', 'payout', 'refund', 'commission', 'other')),
  payment_method TEXT NOT NULL DEFAULT 'manual',

  mpesa_receipt TEXT,
  mpesa_message TEXT,
  status TEXT NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'verified', 'failed', 'reversed')),
  paid_at TIMESTAMPTZ,

  notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_payments_listing_id_idx
  ON public.admin_payments (listing_id);

CREATE INDEX IF NOT EXISTS admin_payments_booking_id_idx
  ON public.admin_payments (house_booking_id);

CREATE INDEX IF NOT EXISTS admin_payments_created_at_idx
  ON public.admin_payments (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_payments_active_idx
  ON public.admin_payments (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_payments_receipt_idx
  ON public.admin_payments (payment_method, mpesa_receipt);

CREATE OR REPLACE FUNCTION public.set_admin_payments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_payments_set_updated_at ON public.admin_payments;
CREATE TRIGGER admin_payments_set_updated_at
BEFORE UPDATE ON public.admin_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_admin_payments_updated_at();

ALTER TABLE public.admin_payments ENABLE ROW LEVEL SECURITY;

-- No client policy: access goes through /api/admin/payments after a server-side
-- profile.role === 'admin' check.
REVOKE ALL ON public.admin_payments FROM anon, authenticated;
GRANT ALL ON public.admin_payments TO service_role;
