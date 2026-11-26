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
