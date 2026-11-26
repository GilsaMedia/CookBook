-- The shopping list (PRD §8.4): one per meal. The app builds it from the
-- meal's dishes (src/lib/shopping.ts) and stores it here, so what's been
-- checked off, and what's already at home, survives rebuilds and is the
-- same on every phone. Members read it; owners and contributors use it.

alter table public.books
  add column pantry text[] not null default array[
    'מים', 'שמן זית', 'שמן קנולה', 'מלח', 'פלפל שחור', 'קמח', 'סוכר', 'פפריקה', 'כמון',
    'כורכום', 'אבקת שום', 'אורגנו', 'קינמון', 'חומץ', 'רוטב סויה'
  ]::text[];

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null,
  meal_id uuid not null unique,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, book_id),
  foreign key (meal_id, book_id) references public.meals (id, book_id) on delete cascade
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  book_id uuid not null,
  -- The ingredient's name and unit family (see keyOf in src/lib/shopping.ts).
  key text not null check (length(key) <= 300),
  name text not null check (length(name) <= 200),
  quantity numeric(12, 2),
  buy numeric(12, 2),
  unit public.ingredient_unit,
  section public.ingredient_section not null default 'other',
  sources text[] not null default '{}',
  checked boolean not null default false,
  in_pantry boolean not null default false,
  created_at timestamptz not null default now(),
  unique (list_id, key),
  foreign key (list_id, book_id) references public.shopping_lists (id, book_id) on delete cascade
);

create index shopping_items_list on public.shopping_items (list_id);

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

create trigger shopping_lists_updated_at before update on public.shopping_lists
  for each row execute function private.set_updated_at();

create policy "shopping_lists: members read" on public.shopping_lists
  for select to authenticated using (private.is_member(book_id));
create policy "shopping_lists: planners add" on public.shopping_lists
  for insert to authenticated with check (private.can_plan(book_id));
create policy "shopping_lists: planners change" on public.shopping_lists
  for update to authenticated using (private.can_plan(book_id)) with check (private.can_plan(book_id));
create policy "shopping_lists: planners delete" on public.shopping_lists
  for delete to authenticated using (private.can_plan(book_id));

create policy "shopping_items: members read" on public.shopping_items
  for select to authenticated using (private.is_member(book_id));
create policy "shopping_items: planners add" on public.shopping_items
  for insert to authenticated with check (private.can_plan(book_id));
create policy "shopping_items: planners change" on public.shopping_items
  for update to authenticated using (private.can_plan(book_id)) with check (private.can_plan(book_id));
create policy "shopping_items: planners delete" on public.shopping_items
  for delete to authenticated using (private.can_plan(book_id));
