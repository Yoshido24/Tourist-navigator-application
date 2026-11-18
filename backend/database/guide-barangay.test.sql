-- Run against a disposable database after all migrations. Fixtures are rolled back.
begin;

insert into auth.users (id, email) values
  ('e995d890-3fae-4879-bc4b-02887e7d2ac1', 'scope-admin@example.invalid'),
  ('e995d890-3fae-4879-bc4b-02887e7d2ac2', 'scope-guide@example.invalid'),
  ('e995d890-3fae-4879-bc4b-02887e7d2ac3', 'scope-municipal@example.invalid');
insert into public.barangays (id, name) values
  ('scope-a', 'Scope A'), ('scope-b', 'Scope B'), ('scope-c', 'Scope C');
insert into public.barangay_admin_assignments (barangay_id, auth_user_id) values
  ('scope-a', 'e995d890-3fae-4879-bc4b-02887e7d2ac1'),
  ('scope-b', 'e995d890-3fae-4879-bc4b-02887e7d2ac1');
insert into public.guides (id, name, status, barangay_id, auth_user_id) values
  ('scope-guide-a', 'Local guide', 'Approved', 'scope-a', 'e995d890-3fae-4879-bc4b-02887e7d2ac2'),
  ('scope-guide-b', 'Other assigned area', 'Approved', 'scope-b', null),
  ('scope-guide-c', 'Outside guide', 'Approved', 'scope-c', null),
  ('scope-guide-none', 'Unassigned guide', 'Approved', null, null),
  ('scope-guide-pending', 'Pending guide', 'Pending', 'scope-a', null);
insert into public.attractions (id, name, barangay_id) values ('scope-attraction', 'Attraction', 'scope-a');
insert into public.bookings (id, target_type, target_id, "attractionId", barangay_id, status)
values ('scope-booking', 'attraction', 'scope-attraction', 'scope-attraction', 'scope-a', 'Approved');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ac1","role":"authenticated","app_metadata":{"role":"barangay_admin"}}', true);
do $$
begin
  if (select count(*) from public.guides where id like 'scope-guide-%') <> 2 then
    raise exception 'Barangay admin must see only approved guides in assigned barangays';
  end if;
  if exists (select 1 from public.approved_guides_for_assignment() where id in ('scope-guide-c', 'scope-guide-none', 'scope-guide-pending'))
     or (select count(*) from public.approved_guides_for_assignment() where id like 'scope-guide-%') <> 2 then
    raise exception 'Guide assignment list is not scoped to assigned barangays';
  end if;
  begin
    update public.guides set barangay_id = 'scope-a' where id = 'scope-guide-b';
    if found then raise exception 'Barangay admin changed a guide assignment'; end if;
  exception when insufficient_privilege then
    null;
  end;
  begin
    update public.bookings set guide_id = 'scope-guide-b', "assignedGuide" = 'Other assigned area', status = 'Assigned'
    where id = 'scope-booking';
    raise exception 'A guide from another barangay was assigned to the booking';
  exception when check_violation then
    null;
  end;
end $$;
update public.bookings set guide_id = 'scope-guide-a', "assignedGuide" = 'Local guide', status = 'Assigned'
where id = 'scope-booking';

select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ac2","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.guides where id = 'scope-guide-a') then
    raise exception 'Guide cannot read their own record';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ac3","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
update public.guides set barangay_id = 'scope-a' where id = 'scope-guide-none';
do $$
begin
  if not exists (select 1 from public.guides where id = 'scope-guide-none' and barangay_id = 'scope-a') then
    raise exception 'Municipal admin could not assign a barangay';
  end if;
end $$;

rollback;
