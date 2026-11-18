-- Apply after local-roles-resorts.sql so public.is_admin() recognizes municipal admins.
create table if not exists public.showcases (
  id text primary key,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null check (length(btrim(description)) between 1 and 2000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);

alter table public.showcases enable row level security;
revoke all on table public.showcases from anon, authenticated;
grant select on table public.showcases to anon, authenticated;
grant insert, update, delete on table public.showcases to authenticated;

drop policy if exists "public read showcase places" on public.showcases;
create policy "public read showcase places" on public.showcases for select to anon, authenticated
  using (true);
drop policy if exists "municipal admins manage showcase places" on public.showcases;
create policy "municipal admins manage showcase places" on public.showcases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
