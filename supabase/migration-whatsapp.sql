-- WhatsApp bridge (Baileys worker)
--
-- The worker pairs the official AseHanta WhatsApp number, keeps its Signal
-- credentials here so restarts don't need a new QR scan, and stores each
-- chat's engine state + short history so replies survive reconnects and
-- serverless-style restarts.
--
-- Both tables are service-role only: RLS is enabled with no policies.

create table if not exists public.whatsapp_auth (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_sessions (
  wa_jid text primary key,
  phone text,
  profile_name text,
  state jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  last_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_sessions_phone_idx
  on public.whatsapp_sessions (phone);

alter table public.whatsapp_auth enable row level security;
alter table public.whatsapp_sessions enable row level security;
