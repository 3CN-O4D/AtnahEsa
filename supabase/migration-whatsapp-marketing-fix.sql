-- ============================================================
-- WhatsApp marketing cadence + "just released" listing posts
-- ------------------------------------------------------------
-- 1. Status and group intervals can be lowered below one hour.
--    The old checks required >= 60 / >= 180 minutes, which made the
--    admin panel fail with a check-constraint error.
-- 2. The default cadence is 50 minutes for both channels.
-- 3. Per-group cadence can also be lowered (old minimum: 180 min).
-- 4. `listings.released_at` is stamped whenever a listing becomes
--    published, including when a taken/booked house is released again.
--    The marketing picker uses it to write "Just released".
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- ------------------------------------------------ account-wide intervals
alter table public.whatsapp_bot_control
  drop constraint if exists whatsapp_bot_control_status_interval_minutes_check;

alter table public.whatsapp_bot_control
  drop constraint if exists whatsapp_bot_control_group_interval_minutes_check;

alter table public.whatsapp_bot_control
  add constraint whatsapp_bot_control_status_interval_minutes_check
  check (status_interval_minutes >= 1);

alter table public.whatsapp_bot_control
  add constraint whatsapp_bot_control_group_interval_minutes_check
  check (group_interval_minutes >= 1);

alter table public.whatsapp_bot_control
  alter column status_interval_minutes set default 50;

alter table public.whatsapp_bot_control
  alter column group_interval_minutes set default 50;

-- Apply the requested 50-minute cadence to the live row.
update public.whatsapp_bot_control
set status_interval_minutes = 50,
    group_interval_minutes = 50,
    updated_at = now()
where id = 1;

-- --------------------------------------------------- per-group cadence
alter table public.whatsapp_marketing_groups
  drop constraint if exists whatsapp_marketing_groups_cadence_minutes_check;

alter table public.whatsapp_marketing_groups
  add constraint whatsapp_marketing_groups_cadence_minutes_check
  check (cadence_minutes >= 1);

alter table public.whatsapp_marketing_groups
  alter column cadence_minutes set default 50;

-- Rows created under the old minimum (180) should follow the new cadence.
update public.whatsapp_marketing_groups
set cadence_minutes = 50,
    updated_at = now()
where cadence_minutes <= 180;

-- ------------------------------------------------- just-released listings
alter table public.listings
  add column if not exists released_at timestamptz;

create index if not exists listings_released_idx
  on public.listings (released_at desc)
  where status = 'published';

create or replace function public.mark_listing_released()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published' then
    if tg_op = 'INSERT' then
      new.released_at := now();
    elsif old.status is distinct from 'published' then
      new.released_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_mark_released on public.listings;

create trigger listings_mark_released
  before insert or update of status on public.listings
  for each row execute function public.mark_listing_released();

comment on column public.listings.released_at is
  'When the listing last became available (published). Used for "Just released" marketing posts.';
