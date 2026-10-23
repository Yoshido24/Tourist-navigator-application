-- Security lockdown migration. Run it LAST, after supabase-attractions-map.sql and
-- fix-rls-and-shop-products.sql and unify-ids-and-guides.sql. Safe to run multiple times.
--
-- Access model:
--   * anon: read attractions and shop products only.
--   * Bookings are created only by the `secure-api` Edge Function (reCAPTCHA + terms check).
--   * admin (JWT app_metadata.role = 'admin'): full access to every table.
--   * guide (Supabase Auth user with a row in public.guides): reads own guide row and
--     assigned bookings (matched by guide_id), and may update the status of those bookings.
--   * Guide sign-ups create a Pending row in public.guides through a trigger on auth.users.
--   * Passwords live only in Supabase Auth (hashed). Plaintext columns are dropped.

-- 0. Plaintext passwords are removed for good.
alter table public.guides drop column if exists password;

alter table public.guides add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.bookings add column if not exists terms_accepted_at timestamptz;
create unique index if not exists guides_auth_user_id_key on public.guides (auth_user_id);

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create or replace function public.current_guide_id() returns text
language sql stable security definer set search_path = public as $$
  select id from public.guides where auth_user_id = auth.uid() and status = 'Approved'
$$;

-- Guide sign-up: supabase.auth.signUp({ options: { data } }) creates a pending application.
create or replace function public.handle_guide_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'guide'
     and (new.raw_user_meta_data ->> 'terms_accepted') = 'true' then
    insert into public.guides (
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
alter table public.shop_products enable row level security;

-- 2. Revoke every existing grant, then re-grant the minimum below.
revoke all on table public.attractions from anon, authenticated;
revoke all on table public.guides from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.shop_products from anon, authenticated;
revoke all on table public.bookings_new, public.bookings_approved, public.bookings_pending, public.bookings_history from anon;
grant select on table public.bookings_new, public.bookings_approved, public.bookings_pending, public.bookings_history to authenticated;

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
  using (guide_id is not null and guide_id = public.current_guide_id());

drop policy if exists "guide update assigned bookings" on public.bookings;
create policy "guide update assigned bookings" on public.bookings for update to authenticated
  using (guide_id is not null and guide_id = public.current_guide_id())
  with check (guide_id = public.current_guide_id());

-- RLS limits which rows a guide can update, not which columns. Guides may change `status` only.
-- Admins and the service role (auth.uid() is null) are unrestricted.
create or replace function public.restrict_guide_booking_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Guides may only change the status of a booking.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists restrict_guide_booking_update on public.bookings;
create trigger restrict_guide_booking_update
  before update on public.bookings
  for each row execute function public.restrict_guide_booking_update();

-- 5. Guides (including pending applications): admin manages all; a guide reads only their own row.
grant select, insert, update, delete on table public.guides to authenticated;

drop policy if exists "admin manage guides" on public.guides;
create policy "admin manage guides" on public.guides for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "guide read own row" on public.guides;
create policy "guide read own row" on public.guides for select to authenticated
  using (auth_user_id = auth.uid());

notify pgrst, 'reload schema';
