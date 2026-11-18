-- Run against a disposable database after showcases.sql. Fixtures are rolled back.
begin;

insert into public.showcases (id, name, description, latitude, longitude) values
  ('showcase-public', 'Riverside lookout', 'A quiet view of the river.', 14.7, 121.1);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon","app_metadata":{}}', true);
do $$
begin
  if not exists (select 1 from public.showcases where id = 'showcase-public') then
    raise exception 'Visitors must see Showcase places';
  end if;
  begin
    insert into public.showcases (id, name, description, latitude, longitude)
    values ('showcase-anon', 'Invalid', 'Visitor entry', 14.7, 121.1);
    raise exception 'Anonymous visitors must not create Showcase places';
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
    insert into public.showcases (id, name, description, latitude, longitude)
    values ('showcase-local', 'Invalid', 'Barangay entry', 14.7, 121.1);
    raise exception 'Barangay admins must not create municipal Showcase places';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"e995d890-3fae-4879-bc4b-02887e7d2ab2","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
insert into public.showcases (id, name, description, latitude, longitude)
values ('showcase-admin', 'Admin place', 'Information for visitors.', 14.7, 121.1);
update public.showcases set description = 'Updated information.' where id = 'showcase-admin';
delete from public.showcases where id = 'showcase-admin';
do $$
begin
  if exists (select 1 from public.showcases where id = 'showcase-admin') then
    raise exception 'Municipal admins must be able to manage Showcase places';
  end if;
end $$;

rollback;
