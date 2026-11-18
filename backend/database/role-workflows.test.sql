-- Run only against a disposable test project. The fixtures and changes are rolled back.
begin;

insert into auth.users (id, email) values
  ('e995d890-3fae-4879-bc4b-02887e7d2ab1', 'flow-barangay@example.invalid'),
  ('e995d890-3fae-4879-bc4b-02887e7d2ab2', 'flow-municipal@example.invalid');
insert into public.barangays (id, name) values
  ('flow-test-area-a', 'Flow Test Area A'),
  ('flow-test-area-b', 'Flow Test Area B');
insert into public.barangay_admin_assignments (barangay_id, auth_user_id)
values ('flow-test-area-a', 'e995d890-3fae-4879-bc4b-02887e7d2ab1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab1","role":"authenticated","app_metadata":{"role":"barangay_admin"}}', true);
do $$
begin
  begin
    insert into public.attractions (id, name, barangay_id)
    values ('flow-test-direct', 'Direct attraction', 'flow-test-area-a');
    raise exception 'Barangay admins must not publish attractions directly';
  exception when insufficient_privilege then
    null;
  end;
end $$;

insert into public.attraction_submissions (id, barangay_id, payload)
values ('flow-test-attraction', 'flow-test-area-a',
  '{"name":"Test attraction","category":"hiking","coords":[14.73,121.15]}'::jsonb);
insert into public.shop_submissions (id, barangay_id, payload)
values ('flow-test-product', 'flow-test-area-a',
  '{"name":"Test product","price":"100","description":"Example","availability":"Market"}'::jsonb);
insert into public.shop_submissions (id, barangay_id, payload)
values ('flow-test-rejected-product', 'flow-test-area-a',
  '{"name":"Rejected product","price":"100","description":"Example","availability":"Market"}'::jsonb);

do $$
begin
  if exists (select 1 from public.attractions where id = 'flow-test-attraction')
     or exists (select 1 from public.shop_products where id = 'flow-test-product') then
    raise exception 'Submissions must not become public before review';
  end if;
  begin
    insert into public.attraction_submissions (barangay_id, payload)
    values ('flow-test-area-b', '{"name":"Outside area","category":"hiking","coords":[14.73,121.15]}'::jsonb);
    raise exception 'Barangay admin submitted outside their assigned area';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.review_attraction_submission('flow-test-attraction', true);
    raise exception 'Barangay admin approved their own submission';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.review_shop_submission('flow-test-product', true);
    raise exception 'Barangay admin approved their own product';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.attraction_submissions (barangay_id, payload)
    values ('flow-test-area-a', '{"name":"Invalid coordinates","category":"hiking","coords":[91,121]}'::jsonb);
    raise exception 'Invalid coordinates were accepted';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.attraction_submissions (barangay_id, payload)
    values ('flow-test-area-a', '{"name":"Invalid images","category":"hiking","coords":[14,121],"images":[123]}'::jsonb);
    raise exception 'Invalid image entries were accepted';
  exception when check_violation then
    null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab2","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
select public.review_attraction_submission('flow-test-attraction', true);
select public.review_shop_submission('flow-test-product', true);
select public.review_shop_submission('flow-test-rejected-product', false);
do $$
begin
  if not exists (select 1 from public.attractions where id = 'flow-test-attraction' and barangay_id = 'flow-test-area-a')
     or not exists (select 1 from public.shop_products where id = 'flow-test-product') then
    raise exception 'Approved submissions were not published';
  end if;
  if exists (select 1 from public.shop_products where id = 'flow-test-rejected-product')
     or not exists (select 1 from public.shop_submissions where id = 'flow-test-rejected-product' and status = 'Rejected') then
    raise exception 'Rejected submissions must remain unpublished';
  end if;
  begin
    perform public.review_attraction_submission('flow-test-attraction', true);
    raise exception 'A reviewed submission was approved twice';
  exception when check_violation then
    null;
  end;
end $$;

reset role;
insert into public.attractions (id, name, barangay_id)
values ('flow-test-other-area', 'Other area attraction', 'flow-test-area-b');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab1","role":"authenticated","app_metadata":{"role":"barangay_admin"}}', true);
do $$
declare changed integer;
begin
  update public.attractions set name = 'Edited' where id = 'flow-test-other-area';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Barangay admin edited an attraction in another area'; end if;
  update public.attractions set name = 'Edited local attraction' where id = 'flow-test-attraction';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Barangay admin could not edit their attraction'; end if;
  begin
    update public.attractions set coords = '[91,121]'::jsonb where id = 'flow-test-attraction';
    raise exception 'Invalid attraction edits were accepted';
  exception when check_violation then
    null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab2","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
reset role;
insert into public.guides (id, name, status, barangay_id) values ('flow-test-guide', 'Test guide', 'Approved', 'flow-test-area-a');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab1","role":"authenticated","app_metadata":{"role":"barangay_admin"}}', true);
do $$
begin
  if not exists (select 1 from public.guides where id = 'flow-test-guide') then
    raise exception 'Barangay admin cannot read a guide in their area';
  end if;
  if not exists (select 1 from public.approved_guides_for_assignment() where id = 'flow-test-guide') then
    raise exception 'Barangay admin cannot select approved guides';
  end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab2","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
reset role;
insert into public.attractions (id, name) values ('flow-test-unassigned', 'Unassigned attraction');
do $$
begin
  begin
    insert into public.bookings (id, target_type, target_id, "attractionId", status)
    values ('flow-test-unassigned-booking', 'attraction', 'flow-test-unassigned', 'flow-test-unassigned', 'Pending');
    raise exception 'An unassigned attraction accepted a booking';
  exception when check_violation then
    null;
  end;
end $$;
alter table public.bookings disable trigger validate_attraction_booking;
insert into public.bookings (id, target_type, target_id, "attractionId", status)
values ('flow-test-legacy-booking', 'attraction', 'flow-test-unassigned', 'flow-test-unassigned', 'Pending');
alter table public.bookings enable trigger validate_attraction_booking;
set local role authenticated;
do $$
declare changed integer;
begin
  update public.attractions set barangay_id = 'flow-test-area-a' where id = 'flow-test-unassigned';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Municipal admin could not assign a legacy attraction to a barangay';
  end if;
  if not exists (select 1 from public.bookings where id = 'flow-test-legacy-booking' and barangay_id = 'flow-test-area-a') then
    raise exception 'Legacy booking was not routed to the assigned barangay';
  end if;
  update public.attractions set barangay_id = 'flow-test-area-b' where id = 'flow-test-unassigned';
  if not exists (select 1 from public.bookings where id = 'flow-test-legacy-booking' and barangay_id = 'flow-test-area-b') then
    raise exception 'Existing booking was not moved with its attraction';
  end if;
end $$;
reset role;
insert into public.bookings (id, target_type, target_id, "attractionId", barangay_id, status)
values ('flow-test-booking', 'attraction', 'flow-test-attraction', 'flow-test-attraction', 'flow-test-area-a', 'Pending');
insert into public.guides (id, name, status, barangay_id) values ('flow-test-active-guide', 'Active guide', 'Approved', 'flow-test-area-a');
insert into public.bookings (id, target_type, target_id, "attractionId", barangay_id, status, guide_id, "assignedGuide")
values ('flow-test-active-booking', 'attraction', 'flow-test-attraction', 'flow-test-attraction',
  'flow-test-area-a', 'Ongoing', 'flow-test-active-guide', 'Active guide');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab1","role":"authenticated","app_metadata":{"role":"barangay_admin"}}', true);
do $$
begin
  begin
    update public.bookings set guide_id = 'flow-test-guide', "assignedGuide" = 'Test guide', status = 'Assigned'
    where id = 'flow-test-booking';
    raise exception 'A guide was assigned before booking approval';
  exception when check_violation then
    null;
  end;
end $$;
update public.bookings set status = 'Approved' where id = 'flow-test-booking';
update public.bookings set guide_id = 'flow-test-guide', "assignedGuide" = 'Test guide', status = 'Assigned'
where id = 'flow-test-booking';

select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab2","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
do $$
declare changed integer;
begin
  update public.bookings set status = 'Rejected' where id = 'flow-test-booking';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'Municipal admin modified a booking instead of overseeing it';
  end if;
  if not exists (select 1 from public.bookings where id = 'flow-test-booking' and status = 'Assigned' and guide_id = 'flow-test-guide') then
    raise exception 'Barangay assignment was not saved';
  end if;
end $$;
do $$
begin
  begin
    delete from public.guides where id = 'flow-test-active-guide';
    raise exception 'An ongoing tour lost its guide';
  exception when check_violation then
    null;
  end;
  if not exists (select 1 from public.guides where id = 'flow-test-active-guide') then
    raise exception 'Active guide deletion was not rolled back';
  end if;
end $$;
delete from public.guides where id = 'flow-test-guide';
do $$
begin
  if not exists (select 1 from public.bookings where id = 'flow-test-booking'
    and guide_id is null and coalesce("assignedGuide", '') = '' and status = 'Approved') then
    raise exception 'Removing a guide did not return the assigned booking for reassignment';
  end if;
end $$;

rollback;
