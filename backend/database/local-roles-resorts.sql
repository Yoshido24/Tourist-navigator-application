-- Local roles, barangays and resorts. Run it AFTER supabase-attractions-map.sql,
-- fix-rls-and-shop-products.sql, unify-ids-and-guides.sql and security-lockdown.sql.
-- Safe to run multiple times.
--
-- Roles:
--   * Municipal Super Admin: JWT app_metadata.role = 'municipal_super_admin' (or the legacy 'admin').
--   * Barangay Admin: a row in public.barangay_admin_assignments (one admin per barangay).
--   * Resort Manager: a row in public.resort_managers, created only after Municipal approval.
-- Roles are never read from user-editable metadata. Staff accounts are created by the
-- `local-accounts` Edge Function with the service role.

-- 1. Municipal Super Admin keeps global access; legacy 'admin' tokens still work.
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'municipal_super_admin')
$$;

-- 2. Barangays and their single Barangay Admin.
create table if not exists public.barangays (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.barangay_admin_assignments (
  barangay_id text primary key references public.barangays(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists barangay_admin_assignments_user_idx on public.barangay_admin_assignments (auth_user_id);

create table if not exists public.resort_managers (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  contact text,
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.resort_manager_applications (
  id text primary key default ('resort-manager-application-' || gen_random_uuid()::text),
  auth_user_id uuid not null references auth.users(id) on delete cascade unique,
  email text not null,
  name text not null,
  contact text,
  terms_accepted_at timestamptz not null,
  resort jsonb not null,
  status text not null default 'Pending',
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.resort_manager_applications add column if not exists email text;
update public.resort_manager_applications a
set email = u.email
from auth.users u
where a.auth_user_id = u.id and a.email is null;
alter table public.resort_manager_applications alter column email set not null;
alter table public.resort_manager_applications drop constraint if exists resort_manager_applications_status_check;
alter table public.resort_manager_applications add constraint resort_manager_applications_status_check
  check (status in ('Pending', 'Approved', 'Rejected'));
alter table public.resort_manager_applications drop constraint if exists resort_manager_applications_services_check;

create or replace function public.valid_resort_services(services jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(services) is distinct from 'array' then false
    when jsonb_array_length(services) > 50 then false
    else not exists (
      select 1
      from jsonb_array_elements(services) service
      where jsonb_typeof(service) is distinct from 'object'
        or jsonb_typeof(service -> 'id') is distinct from 'string'
        or length(btrim(service ->> 'id')) not between 1 and 120
        or jsonb_typeof(service -> 'type') is distinct from 'string'
        or service ->> 'type' not in ('day_visit', 'facility', 'overnight', 'activity')
        or jsonb_typeof(service -> 'name') is distinct from 'string'
        or length(btrim(service ->> 'name')) not between 1 and 120
        or (service ? 'description' and jsonb_typeof(service -> 'description') is distinct from 'string')
        or length(coalesce(service ->> 'description', '')) > 500
        or not case
          when jsonb_typeof(service -> 'fee') = 'number' and (service ->> 'fee') ~ '^[0-9]{1,16}$'
            then (service ->> 'fee')::numeric <= 9007199254740991
          else false
        end
        or jsonb_typeof(service -> 'pricingUnit') is distinct from 'string'
        or service ->> 'pricingUnit' not in ('person', 'group', 'day', 'night', 'hour', 'booking')
    )
    and (select count(distinct service ->> 'id') from jsonb_array_elements(services) service) = jsonb_array_length(services)
  end
$$;
alter table public.resort_manager_applications add constraint resort_manager_applications_services_check
  check (public.valid_resort_services(resort -> 'services'));

alter table public.attractions add column if not exists barangay_id text references public.barangays(id) on delete set null;
create index if not exists attractions_barangay_idx on public.attractions (barangay_id);

create or replace function public.current_barangay_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select barangay_id from public.barangay_admin_assignments where auth_user_id = auth.uid()
$$;

create or replace function public.is_barangay_admin_for(target text) returns boolean
language sql stable security definer set search_path = public as $$
  select target is not null and exists (
    select 1 from public.barangay_admin_assignments
    where barangay_id = target and auth_user_id = auth.uid()
  )
$$;

create or replace function public.is_barangay_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.barangay_admin_assignments where auth_user_id = auth.uid())
$$;

create or replace function public.is_resort_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.resort_managers where auth_user_id = auth.uid())
$$;

-- 3. Resorts: `resorts` holds only the approved public version; edits wait in `resort_submissions`.
create table if not exists public.resorts (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  barangay_id text not null references public.barangays(id),
  name text not null,
  description text,
  address text,
  contact text,
  images jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.resorts add column if not exists services jsonb not null default '[]'::jsonb;
create index if not exists resorts_owner_idx on public.resorts (owner_id);

create or replace function public.owns_resort(target text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.resorts where id = target and owner_id = auth.uid())
$$;

create table if not exists public.resort_submissions (
  id text primary key default ('resort-submission-' || gen_random_uuid()::text),
  resort_id text references public.resorts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  barangay_id text not null references public.barangays(id),
  name text not null,
  description text,
  address text,
  contact text,
  images jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  status text not null default 'Pending',
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.resort_submissions add column if not exists services jsonb not null default '[]'::jsonb;
alter table public.resort_submissions drop constraint if exists resort_submissions_status_check;
alter table public.resort_submissions add constraint resort_submissions_status_check
  check (status in ('Pending', 'Approved', 'Rejected'));
alter table public.resorts drop constraint if exists resorts_services_check;
alter table public.resorts add constraint resorts_services_check check (public.valid_resort_services(services));
alter table public.resort_submissions drop constraint if exists resort_submissions_services_check;
alter table public.resort_submissions add constraint resort_submissions_services_check check (public.valid_resort_services(services));
create index if not exists resort_submissions_owner_idx on public.resort_submissions (owner_id);
create unique index if not exists resort_submissions_one_pending_per_resort
  on public.resort_submissions (resort_id) where status = 'Pending' and resort_id is not null;

do $$
declare t text;
begin
  foreach t in array array['resorts', 'resort_submissions', 'resort_manager_applications'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- 4. Bookings: explicit target type and routing.
alter table public.bookings add column if not exists target_type text not null default 'attraction';
alter table public.bookings add column if not exists target_id text;
alter table public.bookings add column if not exists barangay_id text references public.barangays(id) on delete set null;
alter table public.bookings add column if not exists resort_id text references public.resorts(id) on delete set null;
alter table public.bookings add column if not exists resort_owner_id uuid references auth.users(id) on delete set null;
alter table public.bookings add column if not exists "checkIn" text;
alter table public.bookings add column if not exists "checkOut" text;
alter table public.bookings add column if not exists service_id text;
alter table public.bookings add column if not exists service_type text;
alter table public.bookings add column if not exists service_name text;
alter table public.bookings add column if not exists service_fee bigint;
alter table public.bookings add column if not exists service_pricing_unit text;

update public.bookings set target_id = "attractionId" where target_id is null and target_type = 'attraction';

alter table public.bookings drop constraint if exists bookings_target_type_check;
alter table public.bookings add constraint bookings_target_type_check check (target_type in ('attraction', 'resort'));
alter table public.bookings drop constraint if exists bookings_resort_stay_check;
alter table public.bookings add constraint bookings_resort_stay_check check (
  target_type = 'attraction'
  or (
    resort_id is not null and service_id is not null
    and service_type in ('day_visit', 'facility', 'overnight', 'activity')
    and service_name is not null and service_fee is not null and service_fee >= 0
    and (
      (service_type = 'overnight' and "checkIn" is not null and "checkOut" is not null and "checkOut" > "checkIn")
      or (service_type <> 'overnight' and "checkIn" is null and "checkOut" is null and date is not null)
    )
  )
);
create index if not exists bookings_barangay_idx on public.bookings (barangay_id);
create index if not exists bookings_resort_owner_idx on public.bookings (resort_owner_id);

-- Re-create the booking lists so they include the new columns.
create or replace view public.bookings_new with (security_invoker = true) as
  select * from public.bookings where status = 'Pending';
create or replace view public.bookings_approved with (security_invoker = true) as
  select * from public.bookings where status = 'Approved';
create or replace view public.bookings_pending with (security_invoker = true) as
  select * from public.bookings where status in ('Assigned', 'Confirmed', 'Ongoing');
create or replace view public.bookings_history with (security_invoker = true) as
  select * from public.bookings where status in ('Completed', 'Cancelled');

-- 5. Resort owner accounts require municipal approval before manager access is granted.
create or replace function public.review_resort_manager_application(application_id text, approved boolean, note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare a public.resort_manager_applications%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only a Municipal Super Admin can review resort owner accounts.' using errcode = '42501';
  end if;
  select * into a from public.resort_manager_applications where id = application_id for update;
  if not found or a.status <> 'Pending' then
    raise exception 'Resort owner application is not pending.' using errcode = 'P0002';
  end if;
  if approved then
    insert into public.resort_managers (auth_user_id, name, contact, terms_accepted_at)
      values (a.auth_user_id, a.name, a.contact, a.terms_accepted_at);
    insert into public.resort_submissions (
      owner_id, barangay_id, name, description, address, contact, images, services, status
    ) values (
      a.auth_user_id, a.resort ->> 'barangayId', a.resort ->> 'name',
      a.resort ->> 'description', a.resort ->> 'address', a.resort ->> 'contact',
      coalesce(a.resort -> 'images', '[]'::jsonb), a.resort -> 'services', 'Pending'
    );
  end if;
  update public.resort_manager_applications
    set status = case when approved then 'Approved' else 'Rejected' end,
        review_note = left(coalesce(note, ''), 500),
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = a.id;
  return case when approved then 'Approved' else 'Rejected' end;
end;
$$;

-- 6. Barangay Admins review listings in their assigned area; Municipal Admins can intervene.
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
    insert into public.resorts (id, owner_id, barangay_id, name, description, address, contact, images, services)
      values (new_resort_id, s.owner_id, s.barangay_id, s.name, s.description, s.address, s.contact, s.images, s.services);
  else
    new_resort_id := s.resort_id;
    update public.resorts set barangay_id = s.barangay_id, name = s.name, description = s.description,
      address = s.address, contact = s.contact, images = s.images, services = s.services where id = s.resort_id;
  end if;
  update public.resort_submissions set status = 'Approved', resort_id = new_resort_id, reviewed_at = now()
    where id = s.id;
  return new_resort_id;
end;
$$;

create or replace function public.reject_resort_submission(submission_id text, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.resort_submissions%rowtype;
begin
  select * into s from public.resort_submissions where id = submission_id for update;
  if not found or s.status <> 'Pending' then
    raise exception 'Resort submission is not pending.' using errcode = 'P0002';
  end if;
  if not public.is_admin() and not public.is_barangay_admin_for(s.barangay_id) then
    raise exception 'You cannot review resort listings outside your barangay.' using errcode = '42501';
  end if;
  update public.resort_submissions
    set status = 'Rejected', review_note = left(coalesce(note, ''), 500), reviewed_at = now()
    where id = submission_id and status = 'Pending';
end;
$$;

revoke all on function public.review_resort_manager_application(text, boolean, text) from public, anon;
revoke all on function public.approve_resort_submission(text) from public, anon;
revoke all on function public.reject_resort_submission(text, text) from public, anon;
grant execute on function public.review_resort_manager_application(text, boolean, text) to authenticated;
grant execute on function public.approve_resort_submission(text) to authenticated;
grant execute on function public.reject_resort_submission(text, text) to authenticated;

-- 6. Row Level Security.
alter table public.barangays enable row level security;
alter table public.barangay_admin_assignments enable row level security;
alter table public.resort_managers enable row level security;
alter table public.resort_manager_applications enable row level security;
alter table public.resorts enable row level security;
alter table public.resort_submissions enable row level security;

revoke all on table public.barangays, public.barangay_admin_assignments, public.resort_managers,
  public.resort_manager_applications, public.resorts, public.resort_submissions from anon, authenticated;

-- Barangays: public names, Super Admin writes.
grant select on table public.barangays to anon, authenticated;
grant insert, update, delete on table public.barangays to authenticated;
drop policy if exists "public read barangays" on public.barangays;
create policy "public read barangays" on public.barangays for select to anon, authenticated using (true);
drop policy if exists "admin write barangays" on public.barangays;
create policy "admin write barangays" on public.barangays for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Assignments: Super Admin manages; a Barangay Admin reads their own. Users cannot edit their own scope.
grant select, insert, update, delete on table public.barangay_admin_assignments to authenticated;
drop policy if exists "admin manage assignments" on public.barangay_admin_assignments;
create policy "admin manage assignments" on public.barangay_admin_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "read own assignments" on public.barangay_admin_assignments;
create policy "read own assignments" on public.barangay_admin_assignments for select to authenticated
  using (auth_user_id = auth.uid());

-- Resort managers: rows are created by the Edge Function; a manager reads their own, Super Admin reads all.
grant select on table public.resort_managers to authenticated;
drop policy if exists "read own manager row" on public.resort_managers;
create policy "read own manager row" on public.resort_managers for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());

-- Owner applications are private; only the Municipal Admin may review them.
grant select on table public.resort_manager_applications to authenticated;
grant insert on table public.resort_manager_applications to service_role;
drop policy if exists "read own or all manager applications" on public.resort_manager_applications;
create policy "read own or all manager applications" on public.resort_manager_applications for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());

-- Approved resorts: public read of listing columns only (owner_id stays private). Writes go through the review functions.
grant select (id, barangay_id, name, description, address, contact, images, services, created_at, updated_at)
  on table public.resorts to anon, authenticated;
drop policy if exists "public read approved resorts" on public.resorts;
create policy "public read approved resorts" on public.resorts for select to anon, authenticated using (true);
create or replace view public.public_resorts with (security_invoker = true) as
  select id, barangay_id, name, description, address, contact, images, services, created_at, updated_at
  from public.resorts;
revoke all on table public.public_resorts from anon, authenticated;
grant select on table public.public_resorts to anon, authenticated;

-- Submissions (initial listings and edits): owners submit; scoped barangay admins and Super Admin review.
grant select, insert, update on table public.resort_submissions to authenticated;
drop policy if exists "read own or all submissions" on public.resort_submissions;
create policy "read own or all submissions" on public.resort_submissions for select to authenticated
  using (owner_id = auth.uid() or public.is_admin() or public.is_barangay_admin_for(barangay_id));
drop policy if exists "managers submit listings" on public.resort_submissions;
create policy "managers submit listings" on public.resort_submissions for insert to authenticated
  with check (
    owner_id = auth.uid() and status = 'Pending' and public.is_resort_manager()
    and (resort_id is null or public.owns_resort(resort_id))
  );
drop policy if exists "managers amend pending submissions" on public.resort_submissions;
create policy "managers amend pending submissions" on public.resort_submissions for update to authenticated
  using (owner_id = auth.uid() and status = 'Pending' and (resort_id is null or public.owns_resort(resort_id)))
  with check (owner_id = auth.uid() and status = 'Pending' and (resort_id is null or public.owns_resort(resort_id)));

-- Attractions: a Barangay Admin manages only attractions in an assigned barangay.
drop policy if exists "barangay admin write attractions" on public.attractions;
create policy "barangay admin write attractions" on public.attractions for all to authenticated
  using (public.is_barangay_admin_for(barangay_id))
  with check (public.is_barangay_admin_for(barangay_id));

-- Bookings: scoped access next to the existing admin and guide policies.
drop policy if exists "barangay admin manage attraction bookings" on public.bookings;
drop policy if exists "barangay admin read attraction bookings" on public.bookings;
drop policy if exists "barangay admin update attraction bookings" on public.bookings;
create policy "barangay admin read attraction bookings" on public.bookings for select to authenticated
  using (target_type = 'attraction' and public.is_barangay_admin_for(barangay_id));
create policy "barangay admin update attraction bookings" on public.bookings for update to authenticated
  using (target_type = 'attraction' and public.is_barangay_admin_for(barangay_id))
  with check (target_type = 'attraction' and public.is_barangay_admin_for(barangay_id));

drop policy if exists "resort manager read resort bookings" on public.bookings;
create policy "resort manager read resort bookings" on public.bookings for select to authenticated
  using (target_type = 'resort' and resort_owner_id = auth.uid());

drop policy if exists "resort manager update resort bookings" on public.bookings;
create policy "resort manager update resort bookings" on public.bookings for update to authenticated
  using (target_type = 'resort' and resort_owner_id = auth.uid() and status = 'Pending')
  with check (target_type = 'resort' and resort_owner_id = auth.uid() and status in ('Approved', 'Rejected'));

-- Barangay Admins assign approved guides to bookings in their area, so they may read approved guides.
drop policy if exists "barangay admin read approved guides" on public.guides;
create policy "barangay admin read approved guides" on public.guides for select to authenticated
  using (status = 'Approved' and public.is_barangay_admin());

-- Non-admin users cannot change routing or traveller details. Guides and resort managers may change
-- `status` only; a Barangay Admin may also manage scheduling fields on their own attraction bookings.
create or replace function public.restrict_guide_booking_update() returns trigger
language plpgsql as $$
declare locked jsonb := to_jsonb(old) - 'status' - 'updated_at';
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if old.target_type = 'resort' and old.resort_owner_id = auth.uid() then
    if old.status <> 'Pending' or new.status not in ('Approved', 'Rejected') then
      raise exception 'Resort managers may accept or decline pending requests only.' using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'Resort managers may only change request status.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.target_type = 'attraction' and public.is_barangay_admin_for(old.barangay_id) then
    locked := to_jsonb(old) - 'status' - 'updated_at' - 'guide_id' - 'assignedGuide' - 'time'
      - 'meetingPoint' - 'scheduleNotes' - 'guideNote' - 'approvedAt' - 'completedAt';
    if (to_jsonb(new) - 'status' - 'updated_at' - 'guide_id' - 'assignedGuide' - 'time'
        - 'meetingPoint' - 'scheduleNotes' - 'guideNote' - 'approvedAt' - 'completedAt') is distinct from locked then
      raise exception 'Barangay admins may only change booking status and scheduling.' using errcode = '42501';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from locked then
    raise exception 'Only the status of this booking can be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
