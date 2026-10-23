-- Run after supabase-attractions-map.sql and BEFORE security-lockdown.sql. Safe to run repeatedly.
--
-- What this does:
--   * Merges public.guide_applications into public.guides (one table, `status` column:
--     Pending / Approved / Rejected). Applicants and approved guides share the same fields.
--   * Links bookings to guides and tourists by ID (guide_id, user_id) instead of by guide name,
--     so two guides can never see or lose each other's bookings.
--   * Every table gets a unique `id`, `created_at` and an auto-maintained `updated_at`.
--   * Adds booking lists as views: new / pending / approved / history.

-- 1. Guides now hold applications too.
alter table public.guides add column if not exists status text not null default 'Approved';
alter table public.guides add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.guides add column if not exists "interviewDate" text;
alter table public.guides add column if not exists "interviewTime" text;
alter table public.guides add column if not exists "interviewLocation" text;
alter table public.guides add column if not exists terms_accepted_at timestamptz;
alter table public.guides drop constraint if exists guides_status_check;
alter table public.guides add constraint guides_status_check check (status in ('Pending', 'Approved', 'Rejected'));
create unique index if not exists guides_auth_user_id_key on public.guides (auth_user_id);

do $$
begin
  if to_regclass('public.guide_applications') is not null then
    -- Applications that were already approved exist in guides under the same id, so skip them.
    insert into public.guides (
      id, name, specialty, contact, availability, email, address, "idNumber", experience,
      "interviewDate", "interviewTime", "interviewLocation", auth_user_id, terms_accepted_at,
      status, created_at
    )
    select
      a.id, a.name, a.specialty, a.contact, a.availability, a.email, a.address, a."idNumber",
      a.experience, a."interviewDate", a."interviewTime", a."interviewLocation", a.auth_user_id,
      a.terms_accepted_at,
      case when a.status = 'Approved' then 'Approved' else 'Pending' end,
      coalesce(a.created_at, now())
    from public.guide_applications a
    where not exists (select 1 from public.guides g where g.id = a.id)
      and (a.auth_user_id is null or not exists (select 1 from public.guides g where g.auth_user_id = a.auth_user_id));
    drop table public.guide_applications;
  end if;
end $$;

-- The sign-up trigger used to insert into guide_applications, which no longer exists.
-- Replace it right away so guide sign-ups never fail with "Database error saving new user".
create or replace function public.handle_guide_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'guide'
     and (new.raw_user_meta_data ->> 'terms_accepted') = 'true' then
    insert into public.guides (
      id, auth_user_id, name, email, specialty, contact, address, "idNumber", experience,
      availability, "interviewDate", "interviewTime", "interviewLocation", status, terms_accepted_at
    ) values (
      'guide-application-' || new.id::text, new.id,
      left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120), new.email,
      left(coalesce(new.raw_user_meta_data ->> 'specialty', ''), 120),
      left(coalesce(new.raw_user_meta_data ->> 'contact', ''), 30),
      left(coalesce(new.raw_user_meta_data ->> 'address', ''), 240),
      left(coalesce(new.raw_user_meta_data ->> 'idNumber', ''), 60),
      left(coalesce(new.raw_user_meta_data ->> 'experience', ''), 1000),
      left(coalesce(new.raw_user_meta_data ->> 'availability', ''), 120),
      left(coalesce(new.raw_user_meta_data ->> 'interviewDate', ''), 20),
      left(coalesce(new.raw_user_meta_data ->> 'interviewTime', ''), 20),
      'Montalban Tourism Office', 'Pending', now()
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_guide on auth.users;
create trigger on_auth_user_created_guide
  after insert on auth.users
  for each row execute function public.handle_guide_signup();

-- 2. Bookings reference guides and tourists by id.
alter table public.bookings add column if not exists guide_id text references public.guides(id) on delete set null;
alter table public.bookings add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.bookings add column if not exists "approvedAt" timestamptz;
alter table public.bookings add column if not exists "completedAt" timestamptz;

-- Backfill guide_id for bookings that were assigned by name (only when the name is unambiguous).
update public.bookings b
set guide_id = g.id
from public.guides g
where b.guide_id is null
  and b."assignedGuide" is not null
  and g.name = b."assignedGuide"
  and (select count(*) from public.guides x where x.name = b."assignedGuide") = 1;

create index if not exists bookings_guide_id_idx on public.bookings (guide_id);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_attraction_id_idx on public.bookings ("attractionId");

-- Remove exact duplicate attractions (same content, different id), keeping the oldest.
-- Bookings pointing at a removed copy are moved to the kept one.
do $$
begin
  create temp table _attraction_dupes on commit drop as
  select id as dup_id,
         first_value(id) over (
           partition by name, category, fee, duration, description, trail, expectations, terrain, "startPoint", coords::text
           order by created_at, id
         ) as keep_id
  from public.attractions;
  update public.bookings b set "attractionId" = d.keep_id
    from _attraction_dupes d where b."attractionId" = d.dup_id and d.dup_id <> d.keep_id;
  delete from public.attractions a using _attraction_dupes d where a.id = d.dup_id and d.dup_id <> d.keep_id;
end $$;

-- 3. Timestamps on every table.
-- Bulk upserts send NULL for columns a row didn't include, so fill the timestamps in here
-- (a BEFORE trigger runs ahead of the NOT NULL check).
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = coalesce(new.created_at, now());
  end if;
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['attractions', 'guides', 'bookings', 'shop_products'] loop
    execute format('alter table public.%I add column if not exists created_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- 4. Booking lists. Same rules the admin screens use. Views run with the caller's rights (RLS applies).
create or replace view public.bookings_new with (security_invoker = true) as
  select * from public.bookings where status = 'Pending';
create or replace view public.bookings_approved with (security_invoker = true) as
  select * from public.bookings where status = 'Approved';
create or replace view public.bookings_pending with (security_invoker = true) as
  select * from public.bookings where status in ('Assigned', 'Confirmed', 'Ongoing');
create or replace view public.bookings_history with (security_invoker = true) as
  select * from public.bookings where status in ('Completed', 'Cancelled');

notify pgrst, 'reload schema';
