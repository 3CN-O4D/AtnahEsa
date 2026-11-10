-- WhatsApp outbox.
--
-- Email is still the source of truth; this table mirrors every notification,
-- OTP and receipt to WhatsApp for people who registered a phone number. Rows
-- are written by the Next.js app and delivered by the always-on Baileys worker,
-- because Vercel cannot hold a WhatsApp socket.
--
-- Service-role only: RLS enabled with no policies.

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  kind text not null default 'notification'
    check (kind in ('notification', 'otp', 'receipt', 'alert', 'document')),
  body text not null,
  media_url text,
  media_base64 text,
  media_mime text,
  file_name text,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists whatsapp_outbox_pending_idx
  on public.whatsapp_outbox (status, created_at);

create index if not exists whatsapp_outbox_phone_idx
  on public.whatsapp_outbox (phone, created_at desc);

alter table public.whatsapp_outbox enable row level security;

-- Housekeeping: drop delivered rows after a week, give up on stale failures.
create or replace function public.prune_whatsapp_outbox()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.whatsapp_outbox
  where (status = 'sent' and sent_at < now() - interval '7 days')
     or (status = 'failed' and updated_at < now() - interval '7 days')
     or (status = 'pending' and created_at < now() - interval '3 days');
$$;
