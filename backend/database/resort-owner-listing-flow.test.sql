-- Run only against a disposable test project after the resort migrations.
begin;

insert into auth.users (id, email) values
  ('e995d890-3fae-4879-bc4b-02887e7d2ab3', 'listing-admin@example.invalid'),
  ('e995d890-3fae-4879-bc4b-02887e7d2ab4', 'listing-owner@example.invalid'),
  ('e995d890-3fae-4879-bc4b-02887e7d2ab5', 'listing-legacy@example.invalid'),
  ('e995d890-3fae-4879-bc4b-02887e7d2ab6', 'listing-barangay@example.invalid');
insert into public.barangays (id, name) values ('listing-test-area', 'Listing Test Area');
insert into public.barangay_admin_assignments (barangay_id, auth_user_id)
values ('listing-test-area', 'e995d890-3fae-4879-bc4b-02887e7d2ab6');
insert into public.resort_manager_applications (id, auth_user_id, email, name, terms_accepted_at, resort)
values
  ('listing-new', 'e995d890-3fae-4879-bc4b-02887e7d2ab4', 'listing-owner@example.invalid', 'Owner', now(),
   '{"name":"New resort","barangayId":"listing-test-area","services":[]}'::jsonb),
  ('listing-legacy', 'e995d890-3fae-4879-bc4b-02887e7d2ab5', 'listing-legacy@example.invalid', 'Legacy', now(),
   '{"name":"Legacy resort","barangayId":"listing-test-area","services":[{"id":"legacy-service","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab3","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
select public.review_resort_manager_application('listing-new', true);
select public.review_resort_manager_application('listing-legacy', true);
do $$
begin
  if exists (select 1 from public.resort_submissions where owner_id = 'e995d890-3fae-4879-bc4b-02887e7d2ab4') then
    raise exception 'New owner listing was submitted before services were added';
  end if;
  if not exists (select 1 from public.resort_submissions where owner_id = 'e995d890-3fae-4879-bc4b-02887e7d2ab5' and status = 'Pending') then
    raise exception 'Legacy application did not retain its pending listing';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab4","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.resort_submissions (owner_id, barangay_id, name, services, status, coords)
    values ('e995d890-3fae-4879-bc4b-02887e7d2ab4', 'listing-test-area', 'No pin',
      '[{"id":"no-pin","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]'::jsonb,
      'Pending', null);
    raise exception 'An owner submitted a listing without a map pin';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.resort_submissions (owner_id, barangay_id, name, services, status, coords)
    values ('e995d890-3fae-4879-bc4b-02887e7d2ab4', 'listing-test-area', 'Invalid pin',
      '[{"id":"invalid-pin","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]'::jsonb,
      'Pending', '[91,121.15]'::jsonb);
    raise exception 'An owner submitted an out-of-range map pin';
  exception when insufficient_privilege then
    null;
  end;
end $$;
insert into public.resort_submissions (owner_id, barangay_id, name, services, status, coords)
values ('e995d890-3fae-4879-bc4b-02887e7d2ab4', 'listing-test-area', 'New resort',
  '[{"id":"new-service","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]'::jsonb,
  'Pending', '[14.73,121.15]'::jsonb);
do $$
begin
  begin
    update public.resort_submissions set services = '[]'::jsonb
    where owner_id = 'e995d890-3fae-4879-bc4b-02887e7d2ab4';
    raise exception 'An owner removed all services from a pending listing';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab6","role":"authenticated"}', true);
select public.approve_resort_submission((select id from public.resort_submissions
  where owner_id = 'e995d890-3fae-4879-bc4b-02887e7d2ab4' and status = 'Pending'));
select public.approve_resort_submission((select id from public.resort_submissions
  where owner_id = 'e995d890-3fae-4879-bc4b-02887e7d2ab5' and status = 'Pending'));
do $$
begin
  if not exists (
    select 1 from public.public_resorts
    where name = 'New resort' and coords = '[14.73,121.15]'::jsonb
  ) then
    raise exception 'Approved resort map pin was not published exactly';
  end if;
  if not exists (
    select 1 from public.public_resorts
    where name = 'Legacy resort' and coords is null
  ) then
    raise exception 'Legacy resort without a map pin was not kept public';
  end if;
  if exists (
    select 1 from public.public_resorts where name = 'No pin' or name = 'Invalid pin'
  ) then
    raise exception 'An unapproved resort submission became publicly visible';
  end if;
end $$;

rollback;
