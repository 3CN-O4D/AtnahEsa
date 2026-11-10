-- Web chat ⇄ WhatsApp hand-off tokens.
--
-- Each row is a single-use capability token that carries the engine state and
-- the last few messages between channels, so a conversation can continue on the
-- other side without starting over. Rows expire after 24 hours and are marked
-- used the moment they are redeemed.
--
-- Service-role only: RLS is enabled with no policies.

create table if not exists public.chat_handoffs (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  direction text not null check (direction in ('web_to_whatsapp', 'whatsapp_to_web')),
  name text,
  phone text,
  summary text,
  state jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  used_at timestamptz
);

create index if not exists chat_handoffs_token_idx on public.chat_handoffs (token);
create index if not exists chat_handoffs_expires_idx on public.chat_handoffs (expires_at);

alter table public.chat_handoffs enable row level security;

-- Housekeeping: drop expired, unused tokens older than a week.
create or replace function public.prune_chat_handoffs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.chat_handoffs
  where created_at < now() - interval '7 days';
$$;
