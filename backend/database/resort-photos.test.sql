-- Run only against a disposable Supabase project after resort-photos.sql.
begin;

insert into auth.users (id, email) values
  ('bf000000-0000-4000-8000-000000000001', 'photo-owner@example.invalid'),
  ('bf000000-0000-4000-8000-000000000002', 'photo-other@example.invalid'),
  ('bf000000-0000-4000-8000-000000000003', 'photo-admin@example.invalid');
insert into public.barangays (id, name) values ('photo-test-area', 'Photo Test Area');
insert into public.resort_managers (auth_user_id, name) values
  ('bf000000-0000-4000-8000-000000000001', 'Owner'),
  ('bf000000-0000-4000-8000-000000000002', 'Other');
insert into public.barangay_admin_assignments (barangay_id, auth_user_id)
values ('photo-test-area', 'bf000000-0000-4000-8000-000000000003');
insert into public.resort_submissions (id, owner_id, barangay_id, name, images, services)
values ('photo-pending', 'bf000000-0000-4000-8000-000000000001', 'photo-test-area', 'Pending resort',
  '["bf000000-0000-4000-8000-000000000001/pending.jpg"]',
  '[{"id":"entry","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]');
insert into public.resort_submissions (id, owner_id, barangay_id, name, images, services)
values ('photo-forged', 'bf000000-0000-4000-8000-000000000002', 'photo-test-area', 'Forged photo',
  '["bf000000-0000-4000-8000-000000000001/pending.jpg"]',
  '[{"id":"entry","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]');
insert into public.resorts (id, owner_id, barangay_id, name, images, services)
values ('photo-approved', 'bf000000-0000-4000-8000-000000000001', 'photo-test-area', 'Approved resort',
  '["bf000000-0000-4000-8000-000000000001/approved.jpg"]',
  '[{"id":"entry","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]');
insert into public.resorts (id, owner_id, barangay_id, name, images, services)
values ('photo-forged-approved', 'bf000000-0000-4000-8000-000000000002', 'photo-test-area', 'Forged approved photo',
  '["bf000000-0000-4000-8000-000000000001/pending.jpg"]',
  '[{"id":"entry","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]');
insert into storage.objects (bucket_id, name) values
  ('resort-photos', 'bf000000-0000-4000-8000-000000000001/pending.jpg'),
  ('resort-photos', 'bf000000-0000-4000-8000-000000000001/approved.jpg');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'resort-photos') <> 1 then
    raise exception 'Visitors must see approved photos only';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'resort-photos') <> 2 then
    raise exception 'Assigned barangay reviewer cannot see pending photos';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'resort-photos') <> 1 then
    raise exception 'Another owner can see a pending photo';
  end if;
  begin
    insert into storage.objects (bucket_id, name)
    values ('resort-photos', 'bf000000-0000-4000-8000-000000000001/other.jpg');
    raise exception 'Another owner uploaded into the wrong folder';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"bf000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into storage.objects (bucket_id, name)
values ('resort-photos', 'bf000000-0000-4000-8000-000000000001/new.jpg');
do $$
declare removed integer;
begin
  if (select count(*) from storage.objects where bucket_id = 'resort-photos') <> 3 then
    raise exception 'Owner cannot see their uploaded photos';
  end if;
  delete from storage.objects where bucket_id = 'resort-photos'
    and name = 'bf000000-0000-4000-8000-000000000001/pending.jpg';
  get diagnostics removed = row_count;
  if removed <> 0 then raise exception 'Owner deleted a referenced photo'; end if;
  delete from storage.objects where bucket_id = 'resort-photos'
    and name = 'bf000000-0000-4000-8000-000000000001/new.jpg';
  get diagnostics removed = row_count;
  if removed <> 1 then raise exception 'Owner cannot clean up an unreferenced upload'; end if;
end $$;

rollback;
