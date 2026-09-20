-- Run this in the Supabase SQL Editor before using the attraction map editor.
-- It creates the attraction fields used by the tourist and admin map views.
create table if not exists public.attractions (
  id text primary key,
  name text not null,
  category text,
  fee text,
  duration text,
  description text,
  trail text,
  expectations text,
  terrain text,
  "startPoint" text,
  images jsonb not null default '[]'::jsonb,
  coords jsonb,
  position jsonb,
  directions text,
  "transportOptions" jsonb not null default '[]'::jsonb,
  "guideAvailable" boolean default true
);

alter table public.attractions add column if not exists trail text;
alter table public.attractions add column if not exists name text;
alter table public.attractions add column if not exists category text;
alter table public.attractions add column if not exists fee text;
alter table public.attractions add column if not exists duration text;
alter table public.attractions add column if not exists description text;
alter table public.attractions add column if not exists expectations text;
alter table public.attractions add column if not exists terrain text;
alter table public.attractions add column if not exists "startPoint" text;
alter table public.attractions add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.attractions add column if not exists coords jsonb;
alter table public.attractions add column if not exists position jsonb;
alter table public.attractions add column if not exists directions text;
alter table public.attractions add column if not exists "transportOptions" jsonb not null default '[]'::jsonb;
alter table public.attractions add column if not exists "guideAvailable" boolean default true;
alter table public.attractions add column if not exists created_at timestamptz not null default now();
alter table public.attractions alter column created_at set default now();

-- The browser app uses readable string IDs such as "waterfalls" and "booking-...".
alter table public.attractions alter column id drop identity if exists;
alter table public.attractions alter column id drop default;
alter table public.attractions alter column id type text using id::text;

-- These tables are also saved by the app whenever an attraction is changed.
create table if not exists public.guides (
  id text primary key,
  name text not null,
  specialty text,
  contact text,
  availability text
);

create table if not exists public.guide_applications (
  id text primary key,
  name text not null,
  specialty text,
  contact text,
  availability text,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);
alter table public.guide_applications disable row level security;
grant select, insert, update, delete on table public.guide_applications to anon;
alter table public.guide_applications add column if not exists email text;
alter table public.guide_applications add column if not exists password text;

alter table public.guides add column if not exists specialty text;
alter table public.guides add column if not exists name text;
alter table public.guides add column if not exists contact text;
alter table public.guides add column if not exists availability text;
alter table public.guides add column if not exists email text;
alter table public.guides add column if not exists password text;
alter table public.guides add column if not exists created_at timestamptz not null default now();
alter table public.guides alter column created_at set default now();
alter table public.guides alter column id drop identity if exists;
alter table public.guides alter column id drop default;
alter table public.guides alter column id type text using id::text;

create table if not exists public.bookings (
  id text primary key,
  "attractionId" text,
  "attractionName" text,
  "travelerName" text,
  contact text,
  date text,
  notes text,
  status text,
  "assignedGuide" text
);

alter table public.bookings add column if not exists "attractionId" text;
alter table public.bookings add column if not exists "attractionName" text;
alter table public.bookings add column if not exists "travelerName" text;
alter table public.bookings add column if not exists contact text;
alter table public.bookings add column if not exists adults integer default 0;
alter table public.bookings add column if not exists kids integer default 0;
alter table public.bookings add column if not exists pwd integer default 0;
-- These columns are required by the user booking form and Admin/Guide views.
-- Run this migration even if public.bookings already exists.
alter table public.bookings alter column adults set default 0;
alter table public.bookings alter column kids set default 0;
alter table public.bookings alter column pwd set default 0;
alter table public.bookings add column if not exists date text;
alter table public.bookings add column if not exists notes text;
alter table public.bookings add column if not exists status text;
alter table public.bookings add column if not exists "assignedGuide" text;
alter table public.bookings add column if not exists time text;
alter table public.bookings add column if not exists "meetingPoint" text;
alter table public.bookings add column if not exists "scheduleNotes" text;
alter table public.bookings add column if not exists created_at timestamptz not null default now();
alter table public.bookings alter column created_at set default now();
alter table public.bookings alter column id drop identity if exists;
alter table public.bookings alter column id drop default;
alter table public.bookings alter column id type text using id::text;

-- Make PostgREST (the Supabase API used by the app) refresh its column cache now.
notify pgrst, 'reload schema';

-- Development only: this app currently has no admin login and uses the anon key.
-- Disable RLS so the admin page can save and the tourist page can read these tables.
alter table public.attractions disable row level security;
alter table public.guides disable row level security;
alter table public.bookings disable row level security;

grant select, insert, update, delete on table public.attractions to anon;
grant select, insert, update, delete on table public.guides to anon;
grant select, insert, update, delete on table public.bookings to anon;

create table if not exists public.shop_products (
  id text primary key,
  name text not null,
  price text,
  description text,
  availability text,
  image text
);

alter table public.shop_products add column if not exists name text;
alter table public.shop_products add column if not exists price text;
alter table public.shop_products add column if not exists description text;
alter table public.shop_products add column if not exists availability text;
alter table public.shop_products add column if not exists image text;
alter table public.shop_products add column if not exists created_at timestamptz not null default now();
alter table public.shop_products disable row level security;
grant select, insert, update, delete on table public.shop_products to anon;

-- Remove the original demo records. This is intentionally limited to the
-- IDs shipped by the demo so newly added attractions, bookings, and guides
-- are preserved.
delete from public.bookings where id = 'booking-1';
delete from public.attractions where id in ('waterfalls', 'heritage', 'market');
delete from public.guides where id in ('guide-1', 'guide-2');
delete from public.shop_products where id in ('shop-basket', 'shop-snacks');

notify pgrst, 'reload schema';
