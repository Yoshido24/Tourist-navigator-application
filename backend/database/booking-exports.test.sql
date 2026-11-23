-- Run only after booking-exports.sql against a disposable test project.
-- Every fixture is removed by the final rollback.
begin;

insert into auth.users (id, email) values
  ('f3a127d0-1dca-41c9-8c82-9f4c7a8c1001', 'export-municipal@example.invalid'),
  ('f3a127d0-1dca-41c9-8c82-9f4c7a8c1002', 'export-barangay@example.invalid'),
  ('f3a127d0-1dca-41c9-8c82-9f4c7a8c1003', 'export-owner@example.invalid');
insert into public.barangays (id, name) values
  ('export-area-a', 'Export Area A'),
  ('export-area-b', 'Export Area B');
insert into public.barangay_admin_assignments (barangay_id, auth_user_id)
values ('export-area-a', 'f3a127d0-1dca-41c9-8c82-9f4c7a8c1002');
insert into public.attractions (id, name, barangay_id) values
  ('export-place-a', 'Export Place A', 'export-area-a'),
  ('export-place-b', 'Export Place B', 'export-area-b');
insert into public.resorts (id, owner_id, barangay_id, name, services) values
  ('export-resort', 'f3a127d0-1dca-41c9-8c82-9f4c7a8c1003', 'export-area-a', 'Export Resort',
   '[{"id":"day-pass","type":"day_visit","name":"Day pass","fee":100,"pricingUnit":"person"}]'::jsonb);

insert into public.bookings
  (id, target_type, target_id, "attractionId", barangay_id, "travelerName", date, status, created_at)
values
  ('export-month-first', 'attraction', 'export-place-a', 'export-place-a', 'export-area-a', 'First day', '2026-10-01', 'Completed', '2026-09-30 16:00:00+00'),
  ('export-month-last', 'attraction', 'export-place-a', 'export-place-a', 'export-area-a', 'Last day', '2026-10-31', 'Cancelled', '2026-10-30 16:00:00+00'),
  ('export-prior', 'attraction', 'export-place-a', 'export-place-a', 'export-area-a', 'Prior month', '2026-09-30', 'Completed', '2026-09-30 16:00:00+00'),
  ('export-next', 'attraction', 'export-place-a', 'export-place-a', 'export-area-a', 'Next month', '2026-11-01', 'Pending', '2026-11-01 16:00:00+00'),
  ('export-other-area', 'attraction', 'export-place-b', 'export-place-b', 'export-area-b', 'Other area', '2026-10-15', 'Completed', '2026-10-14 16:00:00+00'),
  ('export-created-fallback', 'attraction', 'export-place-a', 'export-place-a', 'export-area-a', 'Created fallback', '', 'Completed', '2026-10-01 16:00:00+00'),
  ('export-malformed-fallback', 'attraction', 'export-place-a', 'export-place-a', 'export-area-a', 'Malformed fallback', 'not-a-date', 'Completed', '2026-10-01 16:00:00+00');
insert into public.bookings
  (id, target_type, target_id, resort_id, resort_owner_id, "travelerName", date, service_id, service_type,
   service_name, service_fee, service_pricing_unit, status, created_at)
values
  ('export-owner-booking', 'resort', 'export-resort', 'export-resort', 'f3a127d0-1dca-41c9-8c82-9f4c7a8c1003',
   'Owner guest', '2026-10-20', 'day-pass', 'day_visit', 'Day pass', 100, 'person',
   'Completed', '2026-10-19 16:00:00+00');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"f3a127d0-1dca-41c9-8c82-9f4c7a8c1001","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
do $$
begin
  if (select count(*) from public.export_bookings_for_month(date '2026-10-23')) <> 6 then
    raise exception 'Municipal export did not include exactly the October rows';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"f3a127d0-1dca-41c9-8c82-9f4c7a8c1002","role":"authenticated","app_metadata":{"role":"barangay_admin"}}', true);
do $$
declare
  exported_ids text[];
begin
  select array_agg(booking_id order by booking_id)
    into exported_ids
  from public.export_bookings_for_month(date '2026-10-01');
  if exported_ids is distinct from array[
    'export-created-fallback',
    'export-malformed-fallback',
    'export-month-first',
    'export-month-last'
  ]::text[] then
    raise exception 'Barangay export crossed month or RLS scope: %', exported_ids;
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"f3a127d0-1dca-41c9-8c82-9f4c7a8c1003","role":"authenticated","app_metadata":{}}', true);
do $$
declare
  exported_ids text[];
begin
  select array_agg(booking_id order by booking_id)
    into exported_ids
  from public.export_bookings_for_month(date '2026-10-01');
  if exported_ids is distinct from array['export-owner-booking']::text[] then
    raise exception 'Resort owner export did not preserve resort RLS scope: %', exported_ids;
  end if;
end $$;

reset role;
rollback;
