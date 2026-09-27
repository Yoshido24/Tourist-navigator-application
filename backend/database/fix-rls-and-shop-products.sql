-- Run this to fix: RLS blocking all writes, and the missing shop_products table.
-- Safe to run multiple times.

create table if not exists public.shop_products (
  id text primary key,
  name text not null,
  price text,
  description text,
  availability text,
  image text,
  created_at timestamptz not null default now()
);

alter table public.attractions disable row level security;
alter table public.guides disable row level security;
alter table public.bookings disable row level security;
alter table public.guide_applications disable row level security;
alter table public.shop_products disable row level security;

grant select, insert, update, delete on table public.attractions to anon;
grant select, insert, update, delete on table public.guides to anon;
grant select, insert, update, delete on table public.bookings to anon;
grant select, insert, update, delete on table public.guide_applications to anon;
grant select, insert, update, delete on table public.shop_products to anon;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
