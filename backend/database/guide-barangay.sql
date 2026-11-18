-- Run after role-workflows.sql. Existing guides remain unassigned until a municipal admin assigns them.
begin;

alter table public.guides
  add column if not exists barangay_id text references public.barangays(id) on delete set null;
create index if not exists guides_barangay_id_idx on public.guides (barangay_id);

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

create or replace function public.validate_booking_guide_barangay() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.target_type = 'attraction'
     and new.guide_id is not null and new.guide_id is distinct from old.guide_id
     and not exists (
       select 1 from public.guides g
       where g.id = new.guide_id and g.status = 'Approved'
         and g.barangay_id = new.barangay_id
     ) then
    raise exception 'Select an approved guide from the booking barangay.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_booking_guide_barangay on public.bookings;
create trigger validate_booking_guide_barangay before update on public.bookings
  for each row execute function public.validate_booking_guide_barangay();

notify pgrst, 'reload schema';
commit;
