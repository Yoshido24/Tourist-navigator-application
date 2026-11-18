-- Run after local-roles-resorts.sql. Existing attractions and products stay public.
create or replace function public.valid_attraction_submission(payload jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(payload) is distinct from 'object' then false
    when octet_length(payload::text) > 20000 then false
    when length(btrim(coalesce(payload ->> 'name', ''))) not between 1 and 120 then false
    when length(btrim(coalesce(payload ->> 'category', ''))) not between 1 and 120 then false
    when jsonb_typeof(payload -> 'coords') is distinct from 'array' then false
    when jsonb_array_length(payload -> 'coords') <> 2 then false
    when jsonb_typeof(payload -> 'coords' -> 0) is distinct from 'number'
      or jsonb_typeof(payload -> 'coords' -> 1) is distinct from 'number' then false
    when (payload -> 'coords' ->> 0)::numeric not between -90 and 90
      or (payload -> 'coords' ->> 1)::numeric not between -180 and 180 then false
    when payload ? 'images' and jsonb_typeof(payload -> 'images') is distinct from 'array' then false
    when payload ? 'images' and exists (
      select 1 from jsonb_array_elements(payload -> 'images') image
      where jsonb_typeof(image) <> 'string' or image #>> '{}' !~* '^https?://'
    ) then false
    when payload ? 'transportOptions' and jsonb_typeof(payload -> 'transportOptions') is distinct from 'array' then false
    when payload ? 'transportOptions' and exists (
      select 1 from jsonb_array_elements(payload -> 'transportOptions') option
      where jsonb_typeof(option) <> 'object'
        or jsonb_typeof(option -> 'mode') is distinct from 'string'
        or (option ? 'fare' and jsonb_typeof(option -> 'fare') is distinct from 'string')
        or (option ? 'time' and jsonb_typeof(option -> 'time') is distinct from 'string')
        or (option ? 'route' and jsonb_typeof(option -> 'route') is distinct from 'string')
    ) then false
    else true
  end
$$;

create or replace function public.valid_shop_submission(payload jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 10000
    and length(btrim(coalesce(payload ->> 'name', ''))) between 1 and 120
    and length(btrim(coalesce(payload ->> 'price', ''))) between 1 and 120
    and length(btrim(coalesce(payload ->> 'description', ''))) between 1 and 2000
    and length(btrim(coalesce(payload ->> 'availability', ''))) between 1 and 240
    and (coalesce(payload ->> 'image', '') = '' or payload ->> 'image' ~* '^https?://')
$$;

create table if not exists public.attraction_submissions (
  id text primary key default ('attraction-' || gen_random_uuid()::text),
  barangay_id text not null references public.barangays(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  payload jsonb not null check (public.valid_attraction_submission(payload)),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_submissions (
  id text primary key default ('shop-' || gen_random_uuid()::text),
  barangay_id text not null references public.barangays(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  payload jsonb not null check (public.valid_shop_submission(payload)),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.attraction_submissions enable row level security;
alter table public.shop_submissions enable row level security;
revoke all on public.attraction_submissions, public.shop_submissions from anon, authenticated;
grant select, insert on public.attraction_submissions, public.shop_submissions to authenticated;

drop policy if exists "staff read attraction submissions" on public.attraction_submissions;
create policy "staff read attraction submissions" on public.attraction_submissions for select to authenticated
  using (public.is_admin() or public.is_barangay_admin_for(barangay_id));
drop policy if exists "barangay submit attractions" on public.attraction_submissions;
create policy "barangay submit attractions" on public.attraction_submissions for insert to authenticated
  with check (public.is_barangay_admin_for(barangay_id) and created_by = auth.uid()
    and status = 'Pending' and reviewed_by is null and reviewed_at is null);

drop policy if exists "staff read shop submissions" on public.shop_submissions;
create policy "staff read shop submissions" on public.shop_submissions for select to authenticated
  using (public.is_admin() or public.is_barangay_admin_for(barangay_id));
drop policy if exists "barangay submit shop products" on public.shop_submissions;
create policy "barangay submit shop products" on public.shop_submissions for insert to authenticated
  with check (public.is_barangay_admin_for(barangay_id) and created_by = auth.uid()
    and status = 'Pending' and reviewed_by is null and reviewed_at is null);

create or replace function public.review_attraction_submission(submission_id text, approved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare submission public.attraction_submissions;
begin
  if not public.is_admin() then
    raise exception 'Only municipal admins may review attractions.' using errcode = '42501';
  end if;
  if approved is null then
    raise exception 'A review decision is required.' using errcode = '23514';
  end if;
  select * into submission from public.attraction_submissions where id = submission_id for update;
  if not found or submission.status <> 'Pending' then
    raise exception 'This attraction is not awaiting review.' using errcode = '23514';
  end if;
  if approved then
    insert into public.attractions (
      id, barangay_id, name, category, fee, duration, description, trail, expectations, terrain,
      "startPoint", images, coords, "transportOptions", "guideAvailable"
    ) values (
      submission.id, submission.barangay_id, btrim(submission.payload ->> 'name'),
      btrim(submission.payload ->> 'category'), coalesce(submission.payload ->> 'fee', ''),
      coalesce(submission.payload ->> 'duration', ''), coalesce(submission.payload ->> 'description', ''),
      coalesce(submission.payload ->> 'trail', ''), coalesce(submission.payload ->> 'expectations', ''),
      coalesce(submission.payload ->> 'terrain', ''), coalesce(submission.payload ->> 'startPoint', ''),
      coalesce(submission.payload -> 'images', '[]'::jsonb), submission.payload -> 'coords',
      coalesce(submission.payload -> 'transportOptions', '[]'::jsonb), true
    );
  end if;
  update public.attraction_submissions set status = case when approved then 'Approved' else 'Rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = submission.id;
end;
$$;

create or replace function public.review_shop_submission(submission_id text, approved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare submission public.shop_submissions;
begin
  if not public.is_admin() then
    raise exception 'Only municipal admins may review shop products.' using errcode = '42501';
  end if;
  if approved is null then
    raise exception 'A review decision is required.' using errcode = '23514';
  end if;
  select * into submission from public.shop_submissions where id = submission_id for update;
  if not found or submission.status <> 'Pending' then
    raise exception 'This product is not awaiting review.' using errcode = '23514';
  end if;
  if approved then
    insert into public.shop_products (id, name, price, description, availability, image)
    values (submission.id, btrim(submission.payload ->> 'name'), submission.payload ->> 'price',
      submission.payload ->> 'description', submission.payload ->> 'availability',
      coalesce(submission.payload ->> 'image', ''));
  end if;
  update public.shop_submissions set status = case when approved then 'Approved' else 'Rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = submission.id;
end;
$$;

revoke all on function public.review_attraction_submission(text, boolean) from public, anon;
revoke all on function public.review_shop_submission(text, boolean) from public, anon;
grant execute on function public.review_attraction_submission(text, boolean) to authenticated;
grant execute on function public.review_shop_submission(text, boolean) to authenticated;

drop policy if exists "admin write attractions" on public.attractions;
drop policy if exists "admin update attractions" on public.attractions;
create policy "admin update attractions" on public.attractions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin insert attractions" on public.attractions;
create policy "admin insert attractions" on public.attractions for insert to authenticated
  with check (public.is_admin());
drop policy if exists "admin delete attractions" on public.attractions;
create policy "admin delete attractions" on public.attractions for delete to authenticated
  using (public.is_admin());
drop policy if exists "barangay admin write attractions" on public.attractions;
drop policy if exists "barangay admin update attractions" on public.attractions;
create policy "barangay admin update attractions" on public.attractions for update to authenticated
  using (public.is_barangay_admin_for(barangay_id))
  with check (public.is_barangay_admin_for(barangay_id));

create or replace function public.restrict_barangay_attraction_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.id is distinct from old.id or new.barangay_id is distinct from old.barangay_id
       or new.created_at is distinct from old.created_at) then
    raise exception 'Attraction identity and barangay cannot be changed.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_admin() and not public.valid_attraction_submission(
    jsonb_build_object('name', new.name, 'category', new.category, 'coords', new.coords,
      'images', new.images, 'transportOptions', new."transportOptions")
  ) then
    raise exception 'Attraction details are invalid.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists restrict_barangay_attraction_update on public.attractions;
create trigger restrict_barangay_attraction_update before update on public.attractions
  for each row execute function public.restrict_barangay_attraction_update();

drop policy if exists "admin manage bookings" on public.bookings;
drop policy if exists "admin read bookings" on public.bookings;
create policy "admin read bookings" on public.bookings for select to authenticated
  using (public.is_admin());

alter table public.guides
  add column if not exists barangay_id text references public.barangays(id) on delete set null;
alter table public.bookings add column if not exists decline_reason text;
alter table public.bookings drop constraint if exists bookings_decline_reason_check;
alter table public.bookings add constraint bookings_decline_reason_check
  check (decline_reason is null or char_length(decline_reason) <= 100);
drop policy if exists "barangay admin read approved guides" on public.guides;
create policy "barangay admin read approved guides" on public.guides for select to authenticated
  using (status = 'Approved' and public.is_barangay_admin_for(barangay_id));
create or replace function public.approved_guides_for_assignment()
returns table (id text, name text, specialty text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_barangay_admin() then
    raise exception 'Only barangay admins may list guides for assignment.' using errcode = '42501';
  end if;
  return query select g.id, g.name, g.specialty from public.guides g
    where g.status = 'Approved' and public.is_barangay_admin_for(g.barangay_id);
end;
$$;
revoke all on function public.approved_guides_for_assignment() from public, anon;
grant execute on function public.approved_guides_for_assignment() to authenticated;

create or replace function public.validate_attraction_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.target_type = 'attraction' and not exists (
    select 1 from public.attractions a
    where a.id = new.target_id and a.id = new."attractionId"
      and a.barangay_id is not null and a.barangay_id = new.barangay_id
  ) then
    raise exception 'Attraction bookings require an assigned barangay.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_attraction_booking on public.bookings;
create trigger validate_attraction_booking before insert on public.bookings
  for each row execute function public.validate_attraction_booking();

create or replace function public.restrict_guide_booking_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  locked jsonb := to_jsonb(old) - 'status' - 'updated_at';
  guide_name text;
begin
  if auth.uid() is null then
    return new;
  end if;
  if pg_trigger_depth() > 1 and old.target_type = 'attraction'
     and (to_jsonb(new) - 'barangay_id' - 'updated_at') is not distinct from
         (to_jsonb(old) - 'barangay_id' - 'updated_at')
     and exists (select 1 from public.attractions a
       where a.id = coalesce(old.target_id, old."attractionId")
         and a.barangay_id is not null and a.barangay_id = new.barangay_id) then
    return new;
  end if;
  if pg_trigger_depth() > 1 and old.guide_id is not null and new.guide_id is null
     and (to_jsonb(new) - 'guide_id' - 'updated_at') is not distinct from
         (to_jsonb(old) - 'guide_id' - 'updated_at')
     and not exists (select 1 from public.guides where id = old.guide_id) then
    if old.status in ('Confirmed', 'Ongoing') then
      raise exception 'A guide with a confirmed or ongoing tour cannot be removed.' using errcode = '23514';
    end if;
    if old.status = 'Assigned' then
      new.status := 'Approved';
      new."assignedGuide" := '';
    end if;
    return new;
  end if;
  if public.is_admin() then
    raise exception 'Municipal admins have read-only access to bookings.' using errcode = '42501';
  end if;
  if old.target_type = 'resort' and old.resort_owner_id = auth.uid() then
    if old.status <> 'Pending' or new.status not in ('Approved', 'Rejected') then
      raise exception 'Resort managers may accept or decline pending requests only.' using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'status' - 'updated_at' - 'decline_reason') is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'decline_reason') then
      raise exception 'Resort managers may only change request status.' using errcode = '42501';
    end if;
    if new.status = 'Approved' and new.decline_reason is not null then
      raise exception 'Only declined requests can have a decline reason.' using errcode = '23514';
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
    if new.status is distinct from old.status and not (
      (old.status = 'Pending' and new.status in ('Approved', 'Rejected'))
      or (old.status = 'Approved' and new.status = 'Assigned')
      or (old.status = 'Assigned' and new.status = 'Approved')
    ) then
      raise exception 'This booking status change is not permitted.' using errcode = '23514';
    end if;
    if new.guide_id is distinct from old.guide_id or new."assignedGuide" is distinct from old."assignedGuide"
       or new.status is distinct from old.status and new.status in ('Approved', 'Assigned') then
      if new.guide_id is not null then
        if old.status not in ('Approved', 'Assigned') or new.status <> 'Assigned' then
          raise exception 'Approve the booking before assigning a guide.' using errcode = '23514';
        end if;
        select name into guide_name from public.guides where id = new.guide_id and status = 'Approved';
        if guide_name is null or new."assignedGuide" is distinct from guide_name then
          raise exception 'Select an approved guide.' using errcode = '23514';
        end if;
      elsif new.status = 'Assigned' or coalesce(new."assignedGuide", '') <> '' then
        raise exception 'A valid guide is required for an assigned booking.' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from locked then
    raise exception 'Only the status of this booking can be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.route_existing_attraction_bookings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.barangay_id is not null and new.barangay_id is distinct from old.barangay_id then
    update public.bookings set barangay_id = new.barangay_id
    where target_type = 'attraction' and coalesce(target_id, "attractionId") = new.id
      and barangay_id is distinct from new.barangay_id;
  end if;
  return new;
end;
$$;
drop trigger if exists route_existing_attraction_bookings on public.attractions;
create trigger route_existing_attraction_bookings after update of barangay_id on public.attractions
  for each row execute function public.route_existing_attraction_bookings();

update public.bookings b set barangay_id = a.barangay_id
from public.attractions a
where b.target_type = 'attraction' and coalesce(b.target_id, b."attractionId") = a.id
  and a.barangay_id is not null and b.barangay_id is distinct from a.barangay_id;

notify pgrst, 'reload schema';
