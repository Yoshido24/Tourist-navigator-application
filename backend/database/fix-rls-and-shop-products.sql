-- Creates the missing shop_products table. Run security-lockdown.sql afterwards.
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

-- Row Level Security is configured in security-lockdown.sql; never disable it here.
notify pgrst, 'reload schema';
