-- More than one book, shares that stay up to date, and people who add to
-- the sharer's own book.
--
-- 1. create_book: an approved user opens another book (up to 10), with the
--    default categories. Books opened by an app admin get the AI at once
--    (the admin is the AI server's owner).
-- 2. A whole-book share accepted with every recipe "follows" the book:
--    recipes added to it later are copied to the recipient too
--    (sync_shared_books, which the app calls when the library opens).
-- 3. A whole-book share can instead invite the person into the book itself
--    (can_add): accepting makes them a contributor who publishes directly
--    (book_members.can_publish), seeing the book live. The owner can remove
--    them at any time.

-- ---------------------------------------------------------------- books

create function public.create_book(p_name text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book uuid;
  v_me uuid := (select auth.uid());
begin
  if not private.is_approved(v_me) then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'bad_name' using errcode = 'P0001';
  end if;
  if (select count(*) from public.book_members m
       where m.user_id = v_me and m.role = 'owner') >= 10 then
    raise exception 'book_limit' using errcode = 'P0001';
  end if;
  insert into public.books (name) values (trim(p_name)) returning id into v_book;
  insert into public.book_members (book_id, user_id, role) values (v_book, v_me, 'owner');
  perform private.seed_default_categories(v_book);
  if private.is_app_admin() then
    insert into public.ai_access (book_id) values (v_book) on conflict do nothing;
  end if;
  return v_book;
end;
$$;
revoke all on function public.create_book(text) from public, anon;
grant execute on function public.create_book(text) to authenticated;

-- ---------------------------------------------------------------- members

alter table public.book_members add column can_publish boolean not null default false;

-- A contributor the owner trusts: their recipes go straight into the book.
create function private.can_publish(p_book uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.book_members m
     where m.book_id = p_book and m.user_id = (select auth.uid())
       and m.role = 'contributor' and m.can_publish and m.revoked_at is null
       and private.is_approved(m.user_id));
$$;
revoke all on function private.can_publish(uuid) from public, anon;
grant execute on function private.can_publish(uuid) to authenticated;

create policy "recipes: trusted contributor publishes" on public.recipes
  for insert to authenticated
  with check (private.can_publish(book_id) and created_by = (select auth.uid())
              and status = 'approved');
create policy "recipes: trusted contributor edits own" on public.recipes
  for update to authenticated
  using (private.can_publish(book_id) and created_by = (select auth.uid()))
  with check (private.can_publish(book_id) and created_by = (select auth.uid())
              and status = 'approved');
create policy "recipes: trusted contributor deletes own" on public.recipes
  for delete to authenticated
  using (private.can_publish(book_id) and created_by = (select auth.uid()));

-- Their own recipes' ingredients, steps and photos too.
create or replace function private.can_edit_recipe(p_recipe uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.recipes r
     where r.id = p_recipe
       and (
         private.member_role(r.book_id) = 'owner'
         or (
           private.member_role(r.book_id) = 'contributor'
           and r.created_by = (select auth.uid())
           and (r.status <> 'approved' or private.can_publish(r.book_id))
         )
       )
  );
$$;

-- ---------------------------------------------------------------- shares

alter table public.shares
  add column can_add boolean not null default false,
  add column follow boolean not null default false,
  add column to_book_id uuid references public.books (id) on delete set null;

-- A copy the recipient deleted stays deleted: the record keeps the
-- recipe it came from, so following doesn't copy it again.
alter table public.share_copies alter column to_recipe_id drop not null;
alter table public.share_copies drop constraint share_copies_to_recipe_id_fkey;
alter table public.share_copies add constraint share_copies_to_recipe_id_fkey
  foreign key (to_recipe_id) references public.recipes (id) on delete set null;

create or replace function private.shares_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'pending';
  new.added_count := 0;
  new.responded_at := null;
  new.created_at := now();
  new.follow := false;
  new.to_book_id := null;
  if new.to_email = private.my_email() then
    raise exception 'share_self' using errcode = 'P0001';
  end if;
  if new.can_add and new.recipe_ids is not null then
    raise exception 'share_bad_recipe' using errcode = 'P0001';
  end if;
  if new.recipe_ids is not null and exists (
    select 1 from unnest(new.recipe_ids) as x(id)
     where not exists (
       select 1 from public.recipes r
        where r.id = x.id and r.book_id = new.from_book_id and r.status = 'approved')
  ) then
    raise exception 'share_bad_recipe' using errcode = 'P0001';
  end if;
  if (select count(*) from public.shares s
       where s.from_user = new.from_user and s.created_at > now() - interval '1 day') >= 50 then
    raise exception 'share_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- One recipe copied into a book: category by name (created if missing),
-- ingredients, steps, the tag. Returns the copy's id.
create function private.copy_recipe(r public.recipes, p_book uuid, p_tag text, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category uuid;
  v_new uuid;
begin
  if r.category_id is not null then
    select c.id into v_category
      from public.categories c
      join public.categories o on o.name = c.name
     where o.id = r.category_id and c.book_id = p_book;
    if v_category is null then
      insert into public.categories (book_id, name, position)
      select p_book, o.name,
             coalesce((select max(c.position) + 1 from public.categories c where c.book_id = p_book), 0)
        from public.categories o where o.id = r.category_id
      returning id into v_category;
    end if;
  end if;

  insert into public.recipes (
    book_id, category_id, title, status, source_url, source_name, created_by,
    servings, prep_time, cook_time, dish_role, uses_oven, oven_temp, uses_stovetop,
    make_ahead, active_minutes, cuisine, tags)
  values (
    p_book, v_category, r.title, 'approved', r.source_url, r.source_name, p_user,
    r.servings, r.prep_time, r.cook_time, r.dish_role, r.uses_oven, r.oven_temp, r.uses_stovetop,
    r.make_ahead, r.active_minutes, r.cuisine,
    array(select distinct t from unnest(r.tags || p_tag) as t))
  returning id into v_new;

  insert into public.ingredients (recipe_id, book_id, display_text, quantity, unit,
                                  canonical_name, section, optional, position)
  select v_new, p_book, i.display_text, i.quantity, i.unit, i.canonical_name, i.section,
         i.optional, i.position
    from public.ingredients i where i.recipe_id = r.id;
  insert into public.steps (recipe_id, book_id, position, text)
  select v_new, p_book, s.position, s.text from public.steps s where s.recipe_id = r.id;
  return v_new;
end;
$$;
revoke all on function private.copy_recipe(public.recipes, uuid, text, uuid) from public, anon, authenticated;

create function private.share_tag(p_share public.shares) returns text
language sql
immutable
set search_path = ''
as $$
  select 'שותף מ' || case when p_share.sender_name ~ '^[א-ת]' then '' else '-' end
         || trim(p_share.sender_name);
$$;

drop function public.accept_share(uuid, uuid[]);

-- Accepting a share. An invitation into the book (can_add) makes the
-- caller a contributor who publishes directly. Otherwise the chosen recipes
-- (all when p_recipe_ids is null) are copied into p_book, one of the
-- caller's own books (their first when null); taking every recipe of a
-- whole-book share follows the book from then on. Returns how many recipes
-- were copied.
create function public.accept_share(p_share uuid, p_recipe_ids uuid[] default null,
                                    p_book uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.shares;
  v_me uuid := (select auth.uid());
  v_book uuid;
  v_tag text;
  v_new uuid;
  v_count integer := 0;
  r public.recipes;
begin
  select * into v_share from public.shares s
   where s.id = p_share and s.to_email = private.my_email()
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_share.status <> 'pending' then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;
  -- The sharer must still own the book.
  if not exists (select 1 from public.book_members m
                  where m.book_id = v_share.from_book_id and m.user_id = v_share.from_user
                    and m.role = 'owner' and m.revoked_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_share.can_add then
    insert into public.book_members (book_id, user_id, role, invited_by, can_publish)
    values (v_share.from_book_id, v_me, 'contributor', v_share.from_user, true)
    on conflict (book_id, user_id) do update
      set revoked_at = null, can_publish = true
      where public.book_members.role <> 'owner';
    update public.shares set status = 'accepted', to_book_id = v_share.from_book_id
     where id = v_share.id;
    return 0;
  end if;

  select m.book_id into v_book from public.book_members m
   where m.user_id = v_me and m.role = 'owner' and m.revoked_at is null
     and (p_book is null or m.book_id = p_book)
   order by m.created_at limit 1;
  if v_book is null then
    raise exception 'no_book' using errcode = 'P0001';
  end if;
  v_tag := private.share_tag(v_share);

  for r in
    select * from private.share_recipes(v_share) x
     where p_recipe_ids is null or x.id = any (p_recipe_ids)
  loop
    v_new := private.copy_recipe(r, v_book, v_tag, v_me);
    insert into public.share_copies (share_id, from_recipe_id, to_recipe_id)
    values (v_share.id, r.id, v_new);
    v_count := v_count + 1;
  end loop;

  update public.shares
     set status = 'accepted', added_count = v_count, to_book_id = v_book,
         follow = v_share.recipe_ids is null and (
           p_recipe_ids is null
           or not exists (select 1 from private.share_recipes(v_share) x
                           where not (x.id = any (p_recipe_ids))))
   where id = v_share.id;
  return v_count;
end;
$$;
revoke all on function public.accept_share(uuid, uuid[], uuid) from public, anon;
grant execute on function public.accept_share(uuid, uuid[], uuid) to authenticated;

-- Copies recipes added since to every followed book of the caller.
-- Returns the shares that got new recipes, and how many.
create function public.sync_shared_books()
returns table (share_id uuid, sender_name text, added integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  s public.shares;
  r public.recipes;
  v_added integer;
begin
  for s in
    select * from public.shares x
     where x.to_email = private.my_email() and x.status = 'accepted' and x.follow
       and exists (select 1 from public.book_members m
                    where m.book_id = x.to_book_id and m.user_id = v_me
                      and m.role = 'owner' and m.revoked_at is null)
     for update
  loop
    v_added := 0;
    for r in
      select * from private.share_recipes(s) y
       where not exists (select 1 from public.share_copies c
                          where c.share_id = s.id and c.from_recipe_id = y.id)
    loop
      insert into public.share_copies (share_id, from_recipe_id, to_recipe_id)
      values (s.id, r.id, private.copy_recipe(r, s.to_book_id, private.share_tag(s), v_me));
      v_added := v_added + 1;
    end loop;
    if v_added > 0 then
      update public.shares set added_count = added_count + v_added where id = s.id;
      share_id := s.id;
      sender_name := s.sender_name;
      added := v_added;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function public.sync_shared_books() from public, anon;
grant execute on function public.sync_shared_books() to authenticated;

-- Either side may stop a book's updates.
create function public.stop_share_updates(p_share uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.shares set follow = false
   where id = p_share
     and (from_user = (select auth.uid()) or to_email = private.my_email());
$$;
revoke all on function public.stop_share_updates(uuid) from public, anon;
grant execute on function public.stop_share_updates(uuid) to authenticated;
