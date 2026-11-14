-- Core multi-tenant schema. Every content table carries book_id.
-- RLS policies live in a later migration; RLS is enabled here on every
-- table so nothing is ever exposed between migrations.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- enums

create type public.member_role as enum ('owner', 'contributor', 'viewer');
create type public.recipe_status as enum ('draft', 'pending', 'approved', 'rejected');
create type public.dish_role as enum (
  'main', 'side', 'salad', 'soup', 'dessert', 'pastry', 'spread', 'drink'
);
-- Store sections, PRD §6. Display order is decided by the app, not the enum.
create type public.ingredient_section as enum (
  'produce', 'bakery', 'dairy_eggs', 'meat_fish', 'frozen', 'canned_sauces',
  'dry_goods', 'baking', 'spices_oils', 'nuts_dried_fruit', 'drinks', 'other'
);
-- Metric base units, PRD §8.3.
create type public.ingredient_unit as enum ('g', 'ml', 'unit');
create type public.preference_scope as enum ('global', 'category', 'recipe');

-- ---------------------------------------------------------------- helpers

create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- people and books

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.book_members (
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (book_id, user_id),
  -- The owner can't be revoked; ownership changes are a separate operation.
  constraint owner_not_revoked check (role <> 'owner' or revoked_at is null)
);

-- Exactly one owner per book.
create unique index book_members_one_owner on public.book_members (book_id)
  where role = 'owner';
create index book_members_user on public.book_members (user_id) where revoked_at is null;

-- ---------------------------------------------------------------- content

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (book_id, name),
  unique (id, book_id)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  category_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  status public.recipe_status not null default 'pending',
  source_url text check (source_url is null or source_url ~* '^https?://'),
  source_name text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  servings numeric(6, 2) check (servings > 0),
  prep_time integer check (prep_time >= 0),    -- minutes
  cook_time integer check (cook_time >= 0),    -- minutes
  -- Menu-builder fields, PRD §13.5
  dish_role public.dish_role,
  uses_oven boolean not null default false,
  oven_temp integer check (oven_temp between 50 and 300), -- °C
  uses_stovetop boolean not null default false,
  make_ahead boolean not null default false,
  active_minutes integer check (active_minutes >= 0),
  cuisine text,
  -- Normalized title + ingredient names, maintained by triggers (search migration).
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, book_id),
  -- A recipe's category must belong to the same book.
  foreign key (category_id, book_id) references public.categories (id, book_id)
    on delete set null (category_id)
);

create index recipes_book_status on public.recipes (book_id, status);
create index recipes_category on public.recipes (category_id);

create trigger recipes_updated_at before update on public.recipes
  for each row execute function private.set_updated_at();

create table public.ingredients (
  -- Stable id: cook-mode checks survive edits and servings changes.
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  book_id uuid not null,
  display_text text not null,
  quantity numeric(10, 3) check (quantity > 0),
  unit public.ingredient_unit,
  canonical_name text,
  section public.ingredient_section not null default 'other',
  optional boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- The ingredient's book must be its recipe's book.
  foreign key (recipe_id, book_id) references public.recipes (id, book_id) on delete cascade
);

create index ingredients_recipe on public.ingredients (recipe_id, position);

create table public.steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  book_id uuid not null,
  position integer not null default 0,
  text text not null,
  created_at timestamptz not null default now(),
  foreign key (recipe_id, book_id) references public.recipes (id, book_id) on delete cascade
);

create index steps_recipe on public.steps (recipe_id, position);

create table public.recipe_images (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  book_id uuid not null,
  -- Object path in the private "recipe-images" bucket: <book_id>/<recipe_id>/<file>
  storage_path text not null unique,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (recipe_id, book_id) references public.recipes (id, book_id) on delete cascade,
  constraint storage_path_in_book check (
    storage_path like book_id::text || '/' || recipe_id::text || '/%'
  )
);

create index recipe_images_recipe on public.recipe_images (recipe_id, position);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role public.member_role not null default 'viewer' check (role <> 'owner'),
  -- Only a hash of the single-use token is stored; the token itself is emailed.
  token_hash text not null unique,
  invited_by uuid default auth.uid() references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  consumed_at timestamptz,
  consumed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invites_book on public.invites (book_id);

create table public.preferences (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  scope public.preference_scope not null,
  category_id uuid,
  recipe_id uuid,
  excluded_ingredients text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (category_id, book_id) references public.categories (id, book_id) on delete cascade,
  foreign key (recipe_id, book_id) references public.recipes (id, book_id) on delete cascade,
  constraint scope_target check (
    (scope = 'global' and category_id is null and recipe_id is null)
    or (scope = 'category' and category_id is not null and recipe_id is null)
    or (scope = 'recipe' and recipe_id is not null and category_id is null)
  )
);

create index preferences_book on public.preferences (book_id);

-- ---------------------------------------------------------------- lock down

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.book_members enable row level security;
alter table public.categories enable row level security;
alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.steps enable row level security;
alter table public.recipe_images enable row level security;
alter table public.invites enable row level security;
alter table public.preferences enable row level security;

-- Signed-out visitors get nothing, even before RLS is consulted.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
