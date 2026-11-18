-- Run only against a disposable test project after the resort migrations.
begin;

insert into auth.users (id, email) values
  ('e995d890-3fae-4879-bc4b-02887e7d2ab3', 'listing-admin@example.invalid'),
  ('e995d890-3fae-4879-bc4b-02887e7d2ab4', 'listing-owner@example.invalid'),
  ('e995d890-3fae-4879-bc4b-02887e7d2ab5', 'listing-legacy@example.invalid');
insert into public.barangays (id, name) values ('listing-test-area', 'Listing Test Area');
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
    insert into public.resort_submissions (owner_id, barangay_id, name, services, status)
    values ('e995d890-3fae-4879-bc4b-02887e7d2ab4', 'listing-test-area', 'New resort', '[]'::jsonb, 'Pending');
    raise exception 'An owner submitted a listing without services';
  exception when insufficient_privilege then
    null;
  end;
end $$;
insert into public.resort_submissions (owner_id, barangay_id, name, services, status)
values ('e995d890-3fae-4879-bc4b-02887e7d2ab4', 'listing-test-area', 'New resort',
  '[{"id":"new-service","name":"Entry","type":"day_visit","fee":100,"pricingUnit":"person"}]'::jsonb, 'Pending');
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

rollback;
