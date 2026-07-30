-- Add escrow_hold_id to transactions for B2C callback to find the escrow directly
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS escrow_hold_id UUID REFERENCES public.escrow_holds(id) ON DELETE SET NULL;

-- Add 'verifying' to escrow_holds status (for future-proofing)
ALTER TABLE public.escrow_holds DROP CONSTRAINT IF EXISTS escrow_holds_status_check;
ALTER TABLE public.escrow_holds ADD CONSTRAINT escrow_holds_status_check
  CHECK (status IN ('held', 'released', 'refunded'));
