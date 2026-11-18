-- Run against a disposable database after event-announcements.sql. Fixtures are rolled back.
begin;

insert into public.announcements (id, title, description, organizer, venue, starts_at, ends_at, banner_path) values
  ('announcement-future', 'Future event', 'Details', 'Tourism Office', 'Town plaza',
   '2099-01-01T18:00:00Z', '2099-01-01T21:00:00Z', 'future.jpg'),
  ('announcement-ended', 'Past event', 'Details', 'Tourism Office', 'Town plaza',
   '2000-01-01T18:00:00Z', '2000-01-01T21:00:00Z', 'past.jpg');

do $$
begin
  if (select count(*) from storage.buckets where id = 'event-banners' and public) <> 1 then
    raise exception 'Event banner bucket must be publicly readable';
  end if;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon","app_metadata":{}}', true);
do $$
begin
  if not exists (select 1 from public.announcements where id = 'announcement-future') then
    raise exception 'Visitors must see current and upcoming announcements';
  end if;
  if exists (select 1 from public.announcements where id = 'announcement-ended') then
    raise exception 'Visitors must not see ended announcements';
  end if;
  begin
    insert into public.announcements (id, title, description, organizer, venue, starts_at, ends_at, banner_path)
    values ('announcement-anon', 'Invalid', 'Details', 'Visitor', 'Town plaza',
      '2099-01-01T18:00:00Z', '2099-01-01T21:00:00Z', 'visitor.jpg');
    raise exception 'Anonymous visitors must not create announcements';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab1","role":"authenticated","app_metadata":{"role":"barangay_admin"}}', true);
do $$
begin
  begin
    insert into public.announcements (id, title, description, organizer, venue, starts_at, ends_at, banner_path)
    values ('announcement-local', 'Invalid', 'Details', 'Local Admin', 'Town plaza',
      '2099-01-01T18:00:00Z', '2099-01-01T21:00:00Z', 'local.jpg');
    raise exception 'Barangay admins must not create municipal announcements';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab2","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
insert into public.announcements (id, title, description, organizer, venue, starts_at, ends_at, banner_path)
values ('announcement-admin', 'Admin event', 'Details', 'Tourism Office', 'Town plaza',
  '2099-01-01T18:00:00Z', '2099-01-01T21:00:00Z', 'admin.jpg');
update public.announcements set venue = 'New venue' where id = 'announcement-admin';
delete from public.announcements where id = 'announcement-admin';
do $$
begin
  if exists (select 1 from public.announcements where id = 'announcement-admin') then
    raise exception 'Municipal admin could not manage announcements';
  end if;
end $$;

rollback;
