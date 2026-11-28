-- Cook mode (PRD §14): where someone is in a recipe, which step and which
-- ingredients are already in the pot. One session per recipe per person,
-- kept here (not on the device) so cooking that starts on the phone
-- continues on the tablet; Realtime sends every change to the other screens.
-- A session is its cook's alone: nobody else in the book sees it. Any member
-- of the book, viewers included, can cook from it.

create table public.cook_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id uuid not null,
  recipe_id uuid not null,
  -- Ingredient ids are stable, so checks survive edits; ids of ingredients
  -- deleted since are ignored by the app.
  checked_ingredient_ids uuid[] not null default '{}'
    check (cardinality(checked_ingredient_ids) <= 500),
  current_step integer not null default 0 check (current_step between 0 and 999),
  -- Goes up by one on every change, so a screen can tell newer from older.
  rev bigint not null default 0,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id),
  foreign key (recipe_id, book_id) references public.recipes (id, book_id) on delete cascade
);

create index cook_sessions_book on public.cook_sessions (book_id);

create function private.cook_sessions_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rev := old.rev + 1;
  new.last_active_at := now();
  return new;
end;
$$;

revoke all on function private.cook_sessions_touch() from public, anon, authenticated;

create trigger cook_sessions_touch before update on public.cook_sessions
  for each row execute function private.cook_sessions_touch();

alter table public.cook_sessions enable row level security;

create policy "cook_sessions: own, in a book they're in" on public.cook_sessions
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(book_id));
create policy "cook_sessions: start own" on public.cook_sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(book_id));
create policy "cook_sessions: change own" on public.cook_sessions
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_member(book_id))
  with check (user_id = (select auth.uid()) and private.is_member(book_id));
create policy "cook_sessions: end own" on public.cook_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Checking an ingredient on two screens at once must not lose either check,
-- so the change is made on the stored list rather than by replacing it.
-- Runs as the caller: RLS limits it to their own sessions.
create function public.cook_check(p_session uuid, p_ingredient uuid, p_checked boolean)
returns setof public.cook_sessions
language sql
security invoker
set search_path = ''
as $$
  update public.cook_sessions
     set checked_ingredient_ids = case
           when p_checked then array_append(array_remove(checked_ingredient_ids, p_ingredient), p_ingredient)
           else array_remove(checked_ingredient_ids, p_ingredient)
         end
   where id = p_session
  returning *;
$$;

revoke all on function public.cook_check(uuid, uuid, boolean) from public, anon;
grant execute on function public.cook_check(uuid, uuid, boolean) to authenticated;

-- Realtime: other screens of the same cook hear each change (RLS applies).
alter publication supabase_realtime add table public.cook_sessions;
