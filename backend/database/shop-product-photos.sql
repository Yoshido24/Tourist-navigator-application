-- Apply after local-roles-resorts.sql. Product photos are public for display;
-- only Municipal and Barangay Admins can upload or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-product-photos', 'shop-product-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff manage shop product photos" on storage.objects;
create policy "staff manage shop product photos" on storage.objects for all to authenticated
  using (bucket_id = 'shop-product-photos' and (public.is_admin() or public.is_barangay_admin()))
  with check (bucket_id = 'shop-product-photos' and (public.is_admin() or public.is_barangay_admin()));
