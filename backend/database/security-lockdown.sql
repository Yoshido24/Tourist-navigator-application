-- Security lockdown migration.
-- Run this AFTER supabase-attractions-map.sql / fix-rls-and-shop-products.sql have created the tables.
-- Safe to run multiple times.
--
-- What this changes:
--   * Re-enables Row Level Security on every table (the earlier migrations disabled it).
--   * Removes the "anon can do anything" grants.
--   * Public (anon) visitors keep exactly the access the app's public pages need:
--       - read attractions & shop products
--       - submit a booking (insert only, cannot read/edit/delete anyone's bookings)
--       - submit a guide application (insert only, cannot read/edit/delete applications)
--   * Everything else (managing attractions/guides/shop products, approving guide
--     applications, updating booking status, reading bookings/applications/guide records
--     including passwords) is only reachable through the `secure-api`, `admin-login` and
--     `guide-login` Supabase Edge Functions, which use the service-role key and enforce
--     their own admin/guide checks. The anon key alone can no longer read or write that data.

-- 1. Re-enable RLS everywhere.
alter table public.attractions enable row level security;
alter table public.guides enable row level security;
alter table public.bookings enable row level security;
alter table public.guide_applications enable row level security;
alter table public.shop_products enable row level security;

-- 2. Revoke the old "anon can do anything" grants before re-granting the minimum needed.
revoke all on table public.attractions from anon;
revoke all on table public.guides from anon;
revoke all on table public.bookings from anon;
revoke all on table public.guide_applications from anon;
revoke all on table public.shop_products from anon;

-- 3. Attractions & shop products: public read-only. All writes go through secure-api (admin only).
drop policy if exists "public read attractions" on public.attractions;
create policy "public read attractions" on public.attractions for select to anon using (true);
grant select on table public.attractions to anon;

drop policy if exists "public read shop products" on public.shop_products;
create policy "public read shop products" on public.shop_products for select to anon using (true);
grant select on table public.shop_products to anon;

-- 4. Bookings: the public booking form may create a booking, but may never read, edit
--    or delete any booking (that would leak every traveler's name/contact info).
drop policy if exists "public can create bookings" on public.bookings;
create policy "public can create bookings" on public.bookings for insert to anon with check (true);
grant insert on table public.bookings to anon;

-- 5. Guide applications: the public sign-up form may create an application, but may
--    never read, edit or delete applications (that would leak plaintext passwords/IDs).
drop policy if exists "public can create guide applications" on public.guide_applications;
create policy "public can create guide applications" on public.guide_applications for insert to anon with check (true);
grant insert on table public.guide_applications to anon;

-- 6. Guides: no anon access at all (raw table holds plaintext passwords). The tourist
--    portal never needs it; admin/guide portals read/write it only via secure-api using
--    the service-role key, which bypasses RLS entirely.

notify pgrst, 'reload schema';
