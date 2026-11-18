-- Apply after local-roles-resorts.sql. Adds the resort profile (facilities, hours,
-- Facebook page, house rules, map pin) and owner-managed closed dates.
begin;

alter table public.resorts
  add column if not exists facilities jsonb not null default '[]'::jsonb,
  add column if not exists opening_hours text,
  add column if not exists facebook_url text,
  add column if not exists house_rules text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists closed_dates jsonb not null default '[]'::jsonb;

alter table public.resort_submissions
  add column if not exists facilities jsonb not null default '[]'::jsonb,
  add column if not exists opening_hours text,
  add column if not exists facebook_url text,
  add column if not exists house_rules text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create or replace function public.valid_resort_profile(
  facilities jsonb, opening_hours text, facebook_url text, house_rules text,
  latitude double precision, longitude double precision
) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    jsonb_typeof(facilities) = 'array'
    and jsonb_array_length(facilities) <= 20
    and not exists (
      select 1 from jsonb_array_elements(facilities) item
      where jsonb_typeof(item) is distinct from 'string' or length(item #>> '{}') not between 1 and 40
    )
    and coalesce(length(opening_hours), 0) <= 200
    and coalesce(length(house_rules), 0) <= 1000
    and (coalesce(facebook_url, '') = '' or (length(facebook_url) <= 300 and facebook_url ~* '^https://[^[:space:]]+$'))
    and ((latitude is null and longitude is null)
      or (latitude between -90 and 90 and longitude between -180 and 180)),
    false)
$$;

alter table public.resorts drop constraint if exists resorts_profile_check;
alter table public.resorts add constraint resorts_profile_check
  check (public.valid_resort_profile(facilities, opening_hours, facebook_url, house_rules, latitude, longitude));
alter table public.resort_submissions drop constraint if exists resort_submissions_profile_check;
alter table public.resort_submissions add constraint resort_submissions_profile_check
  check (public.valid_resort_profile(facilities, opening_hours, facebook_url, house_rules, latitude, longitude));

create or replace function public.approve_resort_submission(submission_id text) returns text
language plpgsql security definer set search_path = public as $$
declare s public.resort_submissions%rowtype; new_resort_id text;
begin
  select * into s from public.resort_submissions where id = submission_id for update;
  if not found or s.status <> 'Pending' then
    raise exception 'Resort submission is not pending.' using errcode = 'P0002';
  end if;
  if not public.is_admin() and not public.is_barangay_admin_for(s.barangay_id) then
    raise exception 'You cannot review resort listings outside your barangay.' using errcode = '42501';
  end if;
  if s.resort_id is null then
    new_resort_id := 'resort-' || gen_random_uuid()::text;
    insert into public.resorts (id, owner_id, barangay_id, name, description, address, contact, images, services,
      facilities, opening_hours, facebook_url, house_rules, latitude, longitude)
      values (new_resort_id, s.owner_id, s.barangay_id, s.name, s.description, s.address, s.contact, s.images, s.services,
        s.facilities, s.opening_hours, s.facebook_url, s.house_rules, s.latitude, s.longitude);
  else
    new_resort_id := s.resort_id;
    update public.resorts set barangay_id = s.barangay_id, name = s.name, description = s.description,
      address = s.address, contact = s.contact, images = s.images, services = s.services,
      facilities = s.facilities, opening_hours = s.opening_hours, facebook_url = s.facebook_url,
      house_rules = s.house_rules, latitude = s.latitude, longitude = s.longitude
      where id = s.resort_id;
  end if;
  update public.resort_submissions set status = 'Approved', resort_id = new_resort_id, reviewed_at = now()
    where id = s.id;
  return new_resort_id;
end;
$$;

-- Closed dates take effect immediately, so owners set them without a review.
create or replace function public.set_resort_closed_dates(target text, dates jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_resort(target) then
    raise exception 'You can only change your own resort.' using errcode = '42501';
  end if;
  if jsonb_typeof(dates) is distinct from 'array' or jsonb_array_length(dates) > 366
     or exists (
       select 1 from jsonb_array_elements(dates) item
       where jsonb_typeof(item) is distinct from 'string' or (item #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ) then
    raise exception 'Closed dates must be a list of up to 366 YYYY-MM-DD dates.' using errcode = '23514';
  end if;
  update public.resorts set closed_dates = dates where id = target;
end;
$$;
revoke all on function public.set_resort_closed_dates(text, jsonb) from public, anon;
grant execute on function public.set_resort_closed_dates(text, jsonb) to authenticated;

grant select (facilities, opening_hours, facebook_url, house_rules, latitude, longitude, closed_dates)
  on table public.resorts to anon, authenticated;
create or replace view public.public_resorts with (security_invoker = true) as
  select id, barangay_id, name, description, address, contact, images, services, created_at, updated_at,
    facilities, opening_hours, facebook_url, house_rules, latitude, longitude, closed_dates
  from public.resorts;

notify pgrst, 'reload schema';
commit;
