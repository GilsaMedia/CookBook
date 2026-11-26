-- Who's who in a meal: each dish records who added it, and members of a
-- book can see each other's names (the meal screen shows "נפתחה על ידי"
-- and who added each dish). Names only: no emails.

alter table public.meal_items
  add column added_by uuid default auth.uid() references public.profiles (id) on delete set null;

-- The names of a book's members, for anyone in the book.
create function public.book_people(p_book uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(trim(p.display_name), ''), split_part(p.email, '@', 1))
    from public.book_members m
    join public.profiles p on p.id = m.user_id
   where m.book_id = p_book
     and private.is_member(p_book);
$$;
revoke all on function public.book_people(uuid) from public, anon;
grant execute on function public.book_people(uuid) to authenticated;

-- ---------------------------------------------------------------- the active meal
--
-- The tray is the book's active meal: it has a name and a date from the
-- start. "פתיחת ארוחה" opens a new one; the one that was active joins the
-- list (or goes, if it had no dishes). A dish added with no active meal
-- opens one for the coming Friday.

create or replace function public.add_to_tray(p_recipe uuid) returns uuid
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
    insert into public.meals (book_id, date)
    values (v_book, current_date + ((5 - extract(dow from current_date)::integer + 7) % 7))
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

-- Opens a new active meal; the previous one joins the list (or goes, if
-- empty). Runs as the caller, so only planners can. Returns its id.
create function public.open_meal(p_book uuid, p_title text, p_date date) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if not private.can_plan(p_book) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select m.id into v_old from public.meals m where m.book_id = p_book and m.status = 'draft';
  if v_old is not null then
    if exists (select 1 from public.meal_items i where i.meal_id = v_old) then
      update public.meals set status = 'done' where id = v_old;
    else
      delete from public.meals where id = v_old;
    end if;
  end if;
  insert into public.meals (book_id, title, date)
  values (p_book, left(trim(coalesce(p_title, '')), 80), p_date)
  returning id into v_new;
  return v_new;
end;
$$;
revoke all on function public.open_meal(uuid, text, date) from public, anon;
grant execute on function public.open_meal(uuid, text, date) to authenticated;
