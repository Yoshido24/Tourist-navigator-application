-- Apply after the resort role and listing migrations.
-- Private objects are visible to their owner and reviewers, and to visitors
-- only when referenced by an approved public resort.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resort-photos', 'resort-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_approved_resort_photo(photo_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resorts r
    where r.images @> jsonb_build_array(photo_path)
      and split_part(photo_path, '/', 1) = r.owner_id::text
  )
$$;
revoke all on function public.is_approved_resort_photo(text) from public;
grant execute on function public.is_approved_resort_photo(text) to anon, authenticated;

create or replace function public.resort_photo_is_unreferenced(photo_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(photo_path, '/', 1) = auth.uid()::text
    and not exists (select 1 from public.resorts r where r.images @> jsonb_build_array(photo_path))
    and not exists (select 1 from public.resort_submissions s where s.images @> jsonb_build_array(photo_path))
$$;
revoke all on function public.resort_photo_is_unreferenced(text) from public;
grant execute on function public.resort_photo_is_unreferenced(text) to authenticated;

drop policy if exists "approved resort photos" on storage.objects;
create policy "approved resort photos" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'resort-photos'
    and public.is_approved_resort_photo(name)
  );

drop policy if exists "owner and reviewer resort photos" on storage.objects;
create policy "owner and reviewer resort photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'resort-photos' and (
      ((storage.foldername(name))[1] = auth.uid()::text and public.is_resort_manager())
      or exists (
        select 1 from public.resort_submissions s
        where s.images @> jsonb_build_array(storage.objects.name)
          and (storage.foldername(storage.objects.name))[1] = s.owner_id::text
          and (s.owner_id = auth.uid() or public.is_admin() or public.is_barangay_admin_for(s.barangay_id))
      )
    )
  );

drop policy if exists "resort manager upload photos" on storage.objects;
create policy "resort manager upload photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resort-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_resort_manager()
  );

drop policy if exists "resort manager remove unreferenced photos" on storage.objects;
create policy "resort manager remove unreferenced photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'resort-photos'
    and public.is_resort_manager()
    and public.resort_photo_is_unreferenced(name)
  );
