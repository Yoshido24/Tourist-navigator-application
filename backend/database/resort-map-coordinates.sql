-- Apply after resort-owner-listing-flow.sql. New owner listings need an exact
-- map pin; legacy approved listings may remain without coordinates.
alter table public.resort_submissions add column if not exists coords jsonb;
alter table public.resorts add column if not exists coords jsonb;

create or replace function public.valid_resort_coords(coords jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(coords) is distinct from 'array' then false
    when jsonb_array_length(coords) <> 2 then false
    when jsonb_typeof(coords -> 0) is distinct from 'number'
      or jsonb_typeof(coords -> 1) is distinct from 'number' then false
    when (coords ->> 0) !~ '^-?[0-9]{1,3}([.][0-9]{1,10})?$'
      or (coords ->> 1) !~ '^-?[0-9]{1,3}([.][0-9]{1,10})?$' then false
    else (coords ->> 0)::numeric between -90 and 90
      and (coords ->> 1)::numeric between -180 and 180
  end
$$;
revoke all on function public.valid_resort_coords(jsonb) from public, anon;
grant execute on function public.valid_resort_coords(jsonb) to authenticated, service_role;

alter table public.resort_submissions drop constraint if exists resort_submissions_coords_check;
alter table public.resort_submissions add constraint resort_submissions_coords_check
  check (coords is null or public.valid_resort_coords(coords));
alter table public.resorts drop constraint if exists resorts_coords_check;
alter table public.resorts add constraint resorts_coords_check
  check (coords is null or public.valid_resort_coords(coords));

drop policy if exists "managers submit listings" on public.resort_submissions;
create policy "managers submit listings" on public.resort_submissions for insert to authenticated
  with check (
    owner_id = auth.uid() and status = 'Pending' and public.is_resort_manager()
    and (resort_id is null or public.owns_resort(resort_id))
    and public.valid_resort_services(services)
    and jsonb_array_length(services) > 0
    and public.valid_resort_coords(coords)
  );

drop policy if exists "managers amend pending submissions" on public.resort_submissions;
create policy "managers amend pending submissions" on public.resort_submissions for update to authenticated
  using (owner_id = auth.uid() and status = 'Pending' and (resort_id is null or public.owns_resort(resort_id)))
  with check (
    owner_id = auth.uid() and status = 'Pending' and (resort_id is null or public.owns_resort(resort_id))
    and public.valid_resort_services(services)
    and jsonb_array_length(services) > 0
    and public.valid_resort_coords(coords)
  );

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
    insert into public.resorts (id, owner_id, barangay_id, name, description, address, contact, images, services, coords)
      values (new_resort_id, s.owner_id, s.barangay_id, s.name, s.description, s.address, s.contact, s.images, s.services, s.coords);
  else
    new_resort_id := s.resort_id;
    update public.resorts set barangay_id = s.barangay_id, name = s.name, description = s.description,
      address = s.address, contact = s.contact, images = s.images, services = s.services, coords = s.coords
      where id = s.resort_id;
  end if;
  update public.resort_submissions set status = 'Approved', resort_id = new_resort_id, reviewed_at = now()
    where id = s.id;
  return new_resort_id;
end;
$$;

grant select (coords) on table public.resorts to anon, authenticated;
create or replace view public.public_resorts with (security_invoker = true) as
  select id, barangay_id, name, description, address, contact, images, services,
    created_at, updated_at, coords
  from public.resorts;
revoke all on table public.public_resorts from anon, authenticated;
grant select on table public.public_resorts to anon, authenticated;
