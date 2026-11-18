-- Run against a disposable project after shop-product-photos.sql.
begin;

insert into auth.users (id, email) values
  ('cf000000-0000-4000-8000-000000000001', 'shop-photo-admin@example.invalid'),
  ('cf000000-0000-4000-8000-000000000002', 'shop-photo-barangay@example.invalid'),
  ('cf000000-0000-4000-8000-000000000003', 'shop-photo-other@example.invalid');
insert into public.barangays (id, name) values ('shop-photo-test-area', 'Shop Photo Test Area');
insert into public.barangay_admin_assignments (barangay_id, auth_user_id)
values ('shop-photo-test-area', 'cf000000-0000-4000-8000-000000000002');

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'shop-product-photos' and public and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  ) then
    raise exception 'Shop product photos must use a public, 5 MB image bucket';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cf000000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{}}', true);
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('shop-product-photos', 'unauthorized.png');
    raise exception 'Unassigned users must not upload product photos';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"cf000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"municipal_super_admin"}}', true);
insert into storage.objects (bucket_id, name) values ('shop-product-photos', 'municipal.png');

select set_config('request.jwt.claims', '{"sub":"cf000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{}}', true);
insert into storage.objects (bucket_id, name) values ('shop-product-photos', 'barangay.png');
delete from storage.objects where bucket_id = 'shop-product-photos'
  and name in ('municipal.png', 'barangay.png');

rollback;
