-- Private map pins for house listings.
-- Safe to re-run.
--
-- Exact coordinates are deliberately NOT columns on public.listings: public
-- pages and cached listing payloads must never accidentally expose a pin before
-- a hunter has paid. This table is readable/writable only through service-role
-- route handlers. Public visitors receive a snapped approximate circle; the
-- paying hunter receives the real point.

create table if not exists public.listing_locations (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  source text not null default 'manual' check (source in ('manual', 'current', 'map')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_locations_latitude_range check (latitude between -90 and 90),
  constraint listing_locations_longitude_range check (longitude between -180 and 180)
);

alter table public.listing_locations enable row level security;

-- No RLS policies for anon/authenticated: the service role is the only way in.
revoke all on public.listing_locations from anon, authenticated;
grant select, insert, update, delete on public.listing_locations to service_role;

comment on table public.listing_locations is
  'Private, payment-gated exact map pins for listings. Never expose through public listing columns.';
