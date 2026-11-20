-- Admin-controlled notification channels and audiences.
--
-- Service-role only: RLS is enabled with no policies, matching the WhatsApp
-- control tables. The website falls back to built-in defaults when this table
-- is missing, so applying the migration is safe on any deployment.

create table if not exists public.admin_notification_preferences (
  notification_type text primary key,
  channels text[] not null default array['web', 'whatsapp']::text[],
  audiences text[] not null default array['admin']::text[],
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint admin_notification_preferences_channels_check
    check (cardinality(channels) > 0 and channels <@ array['web', 'whatsapp']::text[]),
  constraint admin_notification_preferences_audiences_check
    check (cardinality(audiences) > 0 and audiences <@ array['everyone', 'hunter', 'lister', 'admin']::text[])
);

alter table public.admin_notification_preferences enable row level security;

insert into public.admin_notification_preferences (notification_type, channels, audiences) values
  ('house_request', array['web', 'whatsapp'], array['admin']),
  ('listing',       array['web', 'whatsapp'], array['admin']),
  ('booking',       array['web', 'whatsapp'], array['admin']),
  ('payment',       array['web', 'whatsapp'], array['admin']),
  ('refund',        array['web', 'whatsapp'], array['admin']),
  ('payout',        array['web', 'whatsapp'], array['admin']),
  ('complaint',     array['web', 'whatsapp'], array['admin']),
  ('registration',  array['web', 'whatsapp'], array['admin']),
  ('wifi',          array['web', 'whatsapp'], array['admin']),
  ('system',        array['web', 'whatsapp'], array['admin'])
on conflict (notification_type) do nothing;
