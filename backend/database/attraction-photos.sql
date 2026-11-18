-- Apply after local-roles-resorts.sql. Attraction photos are public so tourists
-- can view them; only municipal and barangay admins can upload or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attraction-photos', 'attraction-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins manage attraction photos" on storage.objects;
create policy "admins manage attraction photos" on storage.objects for all to authenticated
  using (bucket_id = 'attraction-photos' and (public.is_admin() or public.is_barangay_admin()))
  with check (bucket_id = 'attraction-photos' and (public.is_admin() or public.is_barangay_admin()));
