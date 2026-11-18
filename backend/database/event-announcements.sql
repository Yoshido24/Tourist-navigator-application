-- Apply after local-roles-resorts.sql. Public visitors can read current events;
-- only Municipal Super Admins can manage records and upload banner images.
create table if not exists public.announcements (
  id text primary key,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null check (length(btrim(description)) between 1 and 2000),
  organizer text not null check (length(btrim(organizer)) between 1 and 120),
  venue text not null check (length(btrim(venue)) between 1 and 240),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  banner_path text not null,
  created_at timestamptz not null default now(),
  constraint announcements_end_after_start check (ends_at > starts_at)
);

create index if not exists announcements_starts_at_idx on public.announcements (starts_at);
create index if not exists announcements_ends_at_idx on public.announcements (ends_at);

alter table public.announcements enable row level security;
revoke all on table public.announcements from anon, authenticated;
grant select on table public.announcements to anon, authenticated;
grant insert, update, delete on table public.announcements to authenticated;

drop policy if exists "public read current event announcements" on public.announcements;
create policy "public read current event announcements" on public.announcements for select to anon, authenticated
  using (ends_at > now());
drop policy if exists "municipal admins manage event announcements" on public.announcements;
create policy "municipal admins manage event announcements" on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-banners', 'event-banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "municipal admins manage event banners" on storage.objects;
create policy "municipal admins manage event banners" on storage.objects for all to authenticated
  using (bucket_id = 'event-banners' and public.is_admin())
  with check (bucket_id = 'event-banners' and public.is_admin());

notify pgrst, 'reload schema';
