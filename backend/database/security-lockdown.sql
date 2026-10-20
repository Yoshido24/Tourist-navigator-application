-- Security lockdown migration. Run it LAST, after supabase-attractions-map.sql and
-- fix-rls-and-shop-products.sql. Safe to run multiple times.
--
-- Access model:
--   * anon: read attractions and shop products only.
--   * Bookings are created only by the `secure-api` Edge Function (reCAPTCHA + terms check).
--   * admin (JWT app_metadata.role = 'admin'): full access to every table.
--   * guide (Supabase Auth user with a row in public.guides): reads own guide row and
--     assigned bookings, and may update the status of those bookings.
--   * Guide sign-ups create a pending application through a trigger on auth.users.
--   * Passwords live only in Supabase Auth (hashed). Plaintext columns are dropped.

-- 0. Plaintext passwords are removed for good.
alter table public.guides drop column if exists password;
alter table public.guide_applications drop column if exists password;

alter table public.guides add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.guide_applications add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.guide_applications add column if not exists terms_accepted_at timestamptz;
alter table public.bookings add column if not exists terms_accepted_at timestamptz;
create unique index if not exists guides_auth_user_id_key on public.guides (auth_user_id);
create unique index if not exists guide_applications_auth_user_id_key on public.guide_applications (auth_user_id);

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create or replace function public.current_guide_name() returns text
language sql stable security definer set search_path = public as $$
  select name from public.guides where auth_user_id = auth.uid()
$$;

-- Guide sign-up: supabase.auth.signUp({ options: { data } }) creates a pending application.
create or replace function public.handle_guide_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'guide'
     and (new.raw_user_meta_data ->> 'terms_accepted') = 'true' then
    insert into public.guide_applications (
      id, auth_user_id, name, email, specialty, contact, address, "idNumber", experience,
      availability, "interviewDate", "interviewTime", "interviewLocation", status, terms_accepted_at
    ) values (
      'guide-application-' || new.id::text, new.id,
      left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120), new.email,
      left(coalesce(new.raw_user_meta_data ->> 'specialty', ''), 120),
      left(coalesce(new.raw_user_meta_data ->> 'contact', ''), 30),
      left(coalesce(new.raw_user_meta_data ->> 'address', ''), 240),
      left(coalesce(new.raw_user_meta_data ->> 'idNumber', ''), 60),
      left(coalesce(new.raw_user_meta_data ->> 'experience', ''), 1000),
      left(coalesce(new.raw_user_meta_data ->> 'availability', ''), 120),
      left(coalesce(new.raw_user_meta_data ->> 'interviewDate', ''), 20),
      left(coalesce(new.raw_user_meta_data ->> 'interviewTime', ''), 20),
      'Montalban Tourism Office', 'Pending', now()
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_guide on auth.users;
create trigger on_auth_user_created_guide
  after insert on auth.users
  for each row execute function public.handle_guide_signup();

-- 1. Re-enable RLS everywhere.
alter table public.attractions enable row level security;
alter table public.guides enable row level security;
alter table public.bookings enable row level security;
alter table public.guide_applications enable row level security;
alter table public.shop_products enable row level security;

-- 2. Revoke every existing grant, then re-grant the minimum below.
revoke all on table public.attractions from anon, authenticated;
revoke all on table public.guides from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.guide_applications from anon, authenticated;
revoke all on table public.shop_products from anon, authenticated;

-- 3. Attractions & shop products: public read, admin write.
grant select on table public.attractions, public.shop_products to anon, authenticated;
grant insert, update, delete on table public.attractions, public.shop_products to authenticated;

drop policy if exists "public read attractions" on public.attractions;
create policy "public read attractions" on public.attractions for select to anon, authenticated using (true);
drop policy if exists "admin write attractions" on public.attractions;
create policy "admin write attractions" on public.attractions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read shop products" on public.shop_products;
create policy "public read shop products" on public.shop_products for select to anon, authenticated using (true);
drop policy if exists "admin write shop products" on public.shop_products;
create policy "admin write shop products" on public.shop_products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 4. Bookings: no anon access at all (inserts go through secure-api with the service role).
grant select, insert, update, delete on table public.bookings to authenticated;

drop policy if exists "public can create bookings" on public.bookings;
drop policy if exists "admin manage bookings" on public.bookings;
create policy "admin manage bookings" on public.bookings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "guide read assigned bookings" on public.bookings;
create policy "guide read assigned bookings" on public.bookings for select to authenticated
  using ("assignedGuide" is not null and "assignedGuide" = public.current_guide_name());

drop policy if exists "guide update assigned bookings" on public.bookings;
create policy "guide update assigned bookings" on public.bookings for update to authenticated
  using ("assignedGuide" is not null and "assignedGuide" = public.current_guide_name())
  with check ("assignedGuide" = public.current_guide_name());

-- 5. Guide applications: admin only. Sign-ups arrive through the auth.users trigger.
grant select, insert, update, delete on table public.guide_applications to authenticated;

drop policy if exists "public can create guide applications" on public.guide_applications;
drop policy if exists "admin manage guide applications" on public.guide_applications;
create policy "admin manage guide applications" on public.guide_applications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6. Guides: admin manages all; a guide reads only their own row.
grant select, insert, update, delete on table public.guides to authenticated;

drop policy if exists "admin manage guides" on public.guides;
create policy "admin manage guides" on public.guides for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "guide read own row" on public.guides;
create policy "guide read own row" on public.guides for select to authenticated
  using (auth_user_id = auth.uid());

notify pgrst, 'reload schema';
