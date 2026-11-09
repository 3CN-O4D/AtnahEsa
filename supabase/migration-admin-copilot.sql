-- Admin copilot audit trail.
--
-- Every copilot mutation (and sensitive user lookup) writes one row here. The
-- API uses the service-role key, so RLS is enabled with no client policies:
-- admins read this through the dashboard/server only.

CREATE TABLE IF NOT EXISTS public.admin_copilot_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  tool TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  summary TEXT,
  error TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_copilot_audit_created_at_idx
  ON public.admin_copilot_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_copilot_audit_admin_idx
  ON public.admin_copilot_audit (admin_id, created_at DESC);

ALTER TABLE public.admin_copilot_audit ENABLE ROW LEVEL SECURITY;

-- No client policies: only the service role (the copilot API) can read/write.
