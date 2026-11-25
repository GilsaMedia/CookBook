-- Meals (PRD §8.1–8.2): the meal tray and saved meals.
--
-- A book has at most one draft meal: its tray. It lives here, not on the
-- device, so it's the same on every phone and for everyone planning in the
-- book. Saving gives it a title and a date (status 'done'); the next dish
-- added starts a new tray. Members read meals; owners and contributors plan
-- them; viewers only look.

create type public.meal_status as enum ('draft', 'done', 'closed');

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  title text not null default '' check (length(title) <= 80),
  date date,
  status public.meal_status not null default 'draft',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, book_id)
);

-- One tray per book.
create unique index meals_one_draft on public.meals (book_id) where status = 'draft';
create index meals_book_date on public.meals (book_id, date desc);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  book_id uuid not null,
  recipe_id uuid not null,
  -- A recipe version (Phase 2, PRD §13.4); null means the recipe itself.
  version_id uuid,
  servings numeric(6, 2) check (servings > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (meal_id, book_id) references public.meals (id, book_id) on delete cascade,
  foreign key (recipe_id, book_id) references public.recipes (id, book_id) on delete cascade
);

create index meal_items_meal on public.meal_items (meal_id, position);

alter table public.meals enable row level security;
alter table public.meal_items enable row level security;

create trigger meals_updated_at before update on public.meals
  for each row execute function private.set_updated_at();

-- Owners and contributors plan meals.
create function private.can_plan(p_book uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.member_role(p_book) in ('owner', 'contributor'), false);
$$;
revoke all on function private.can_plan(uuid) from public, anon;
grant execute on function private.can_plan(uuid) to authenticated;

create policy "meals: members read" on public.meals
  for select to authenticated using (private.is_member(book_id));
create policy "meals: planners add" on public.meals
  for insert to authenticated with check (private.can_plan(book_id));
create policy "meals: planners change" on public.meals
  for update to authenticated using (private.can_plan(book_id)) with check (private.can_plan(book_id));
create policy "meals: planners delete" on public.meals
  for delete to authenticated using (private.can_plan(book_id));

create policy "meal_items: members read" on public.meal_items
  for select to authenticated using (private.is_member(book_id));
create policy "meal_items: planners add" on public.meal_items
  for insert to authenticated with check (private.can_plan(book_id));
create policy "meal_items: planners change" on public.meal_items
  for update to authenticated using (private.can_plan(book_id)) with check (private.can_plan(book_id));
create policy "meal_items: planners delete" on public.meal_items
  for delete to authenticated using (private.can_plan(book_id));

-- "הוספה לארוחה": the dish goes on the book's tray (started if there is
-- none), at the end, with the recipe's servings; a dish already on the
-- tray isn't added twice. Runs as the caller, so the policies above apply.
-- Returns the tray's id.
create function public.add_to_tray(p_recipe uuid) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_book uuid;
  v_servings numeric;
  v_meal uuid;
begin
  select r.book_id, r.servings into v_book, v_servings
    from public.recipes r where r.id = p_recipe;
  if v_book is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not private.can_plan(v_book) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select m.id into v_meal from public.meals m where m.book_id = v_book and m.status = 'draft';
  if v_meal is null then
    insert into public.meals (book_id) values (v_book)
    on conflict (book_id) where status = 'draft' do nothing
    returning id into v_meal;
    if v_meal is null then
      select m.id into v_meal from public.meals m where m.book_id = v_book and m.status = 'draft';
    end if;
  end if;
  if not exists (select 1 from public.meal_items i where i.meal_id = v_meal and i.recipe_id = p_recipe) then
    insert into public.meal_items (meal_id, book_id, recipe_id, servings, position)
    values (v_meal, v_book, p_recipe, v_servings,
            coalesce((select max(i.position) + 1 from public.meal_items i where i.meal_id = v_meal), 0));
  end if;
  return v_meal;
end;
$$;
revoke all on function public.add_to_tray(uuid) from public, anon;
grant execute on function public.add_to_tray(uuid) to authenticated;
