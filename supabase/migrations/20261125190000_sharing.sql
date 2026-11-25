-- Sharing recipes with people outside the book.
--
-- A book's owner shares the whole book or chosen recipes with people they
-- name by email. Each share waits for that person: when they sign in with
-- that (verified) email, they see what was shared, choose all of it or some
-- recipes, and those are copied into their own book as ordinary recipes,
-- tagged "שותף מ<name>". The copies are theirs; the sharer's book is never
-- opened to them. A whole-book share copies the book as it is when they
-- accept. Then the app copies the photos (share_photos): until a recipe's
-- photos are copied, its recipient may read them in Storage, and no longer.

create type public.share_status as enum ('pending', 'accepted', 'declined');

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  from_book_id uuid not null references public.books (id) on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- How the sharer appears to them, and in the tag on every copied recipe.
  sender_name text not null check (length(trim(sender_name)) between 1 and 40),
  to_email text not null check (to_email = lower(trim(to_email)) and to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- null: the whole book.
  recipe_ids uuid[] check (recipe_ids is null or cardinality(recipe_ids) between 1 and 500),
  status public.share_status not null default 'pending',
  added_count integer not null default 0,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index shares_to_email on public.shares (to_email) where status = 'pending';
create index shares_from_book on public.shares (from_book_id, created_at desc);

-- Which copy came from which recipe, so photos can follow.
create table public.share_copies (
  share_id uuid not null references public.shares (id) on delete cascade,
  from_recipe_id uuid not null,
  to_recipe_id uuid not null references public.recipes (id) on delete cascade,
  images_copied boolean not null default false,
  primary key (share_id, from_recipe_id)
);

alter table public.shares enable row level security;
alter table public.share_copies enable row level security;
-- share_copies: no policies; only security-definer functions and the
-- service role touch it.

-- The caller's email, only once it's verified.
create function private.my_email() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
    from auth.users u
   where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;
revoke all on function private.my_email() from public, anon;
grant execute on function private.my_email() to authenticated;

create policy "shares: sender reads" on public.shares
  for select to authenticated using (from_user = (select auth.uid()) and private.is_owner(from_book_id));
create policy "shares: recipient reads" on public.shares
  for select to authenticated using (to_email = private.my_email());
create policy "shares: owner shares" on public.shares
  for insert to authenticated with check (from_user = (select auth.uid()) and private.is_owner(from_book_id));
-- The sender may take back a share nobody has answered yet.
create policy "shares: sender withdraws" on public.shares
  for delete to authenticated using (from_user = (select auth.uid()) and status = 'pending');
-- The recipient may only say no; yes goes through accept_share.
create policy "shares: recipient declines" on public.shares
  for update to authenticated using (to_email = private.my_email() and status = 'pending')
  with check (status = 'declined');

revoke update on public.shares from authenticated;
grant update (status) on public.shares to authenticated;

-- New shares: pending, not to yourself, the recipes from this book, and at
-- most 50 a day per sender.
create function private.shares_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'pending';
  new.added_count := 0;
  new.responded_at := null;
  new.created_at := now();
  if new.to_email = private.my_email() then
    raise exception 'share_self' using errcode = 'P0001';
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

create trigger shares_guard before insert on public.shares
  for each row execute function private.shares_guard();

create function private.shares_responded() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger shares_responded before update on public.shares
  for each row execute function private.shares_responded();

-- The recipes a share offers, while it waits for its recipient.
create function private.share_recipes(p_share public.shares)
returns setof public.recipes
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
    from public.recipes r
   where r.book_id = p_share.from_book_id
     and r.status = 'approved'
     and (p_share.recipe_ids is null or r.id = any (p_share.recipe_ids))
     -- The sharer must still own the book.
     and exists (select 1 from public.book_members m
                  where m.book_id = p_share.from_book_id and m.user_id = p_share.from_user
                    and m.role = 'owner' and m.revoked_at is null)
   order by r.title;
$$;
revoke all on function private.share_recipes(public.shares) from public, anon, authenticated;

-- What the recipient sees before choosing: titles and categories only.
create function public.share_preview(p_share uuid)
returns table (recipe_id uuid, title text, category text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_share public.shares;
begin
  select * into v_share from public.shares s
   where s.id = p_share and s.to_email = private.my_email() and s.status = 'pending';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return query
    select r.id, r.title, c.name
      from private.share_recipes(v_share) r
      left join public.categories c on c.id = r.category_id;
end;
$$;
revoke all on function public.share_preview(uuid) from public, anon;
grant execute on function public.share_preview(uuid) to authenticated;

-- Copies the chosen recipes (all of the share's when p_recipe_ids is null)
-- into the recipient's own book, with ingredients and steps, into a
-- category of the same name (created if they don't have it), tagged
-- "שותף מ<name>". Returns how many were added.
create function public.accept_share(p_share uuid, p_recipe_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.shares;
  v_book uuid;
  v_tag text;
  v_category uuid;
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
  select m.book_id into v_book from public.book_members m
   where m.user_id = (select auth.uid()) and m.role = 'owner' and m.revoked_at is null
   order by m.created_at limit 1;
  if v_book is null then
    raise exception 'no_book' using errcode = 'P0001';
  end if;
  v_tag := 'שותף מ' || case when v_share.sender_name ~ '^[א-ת]' then '' else '-' end
           || trim(v_share.sender_name);

  for r in
    select * from private.share_recipes(v_share) x
     where p_recipe_ids is null or x.id = any (p_recipe_ids)
  loop
    v_category := null;
    if r.category_id is not null then
      select c.id into v_category
        from public.categories c
        join public.categories o on o.name = c.name
       where o.id = r.category_id and c.book_id = v_book;
      if v_category is null then
        insert into public.categories (book_id, name, position)
        select v_book, o.name,
               coalesce((select max(c.position) + 1 from public.categories c where c.book_id = v_book), 0)
          from public.categories o where o.id = r.category_id
        returning id into v_category;
      end if;
    end if;

    insert into public.recipes (
      book_id, category_id, title, status, source_url, source_name, created_by,
      servings, prep_time, cook_time, dish_role, uses_oven, oven_temp, uses_stovetop,
      make_ahead, active_minutes, cuisine, tags)
    values (
      v_book, v_category, r.title, 'approved', r.source_url, r.source_name, (select auth.uid()),
      r.servings, r.prep_time, r.cook_time, r.dish_role, r.uses_oven, r.oven_temp, r.uses_stovetop,
      r.make_ahead, r.active_minutes, r.cuisine,
      array(select distinct t from unnest(r.tags || v_tag) as t))
    returning id into v_new;

    insert into public.ingredients (recipe_id, book_id, display_text, quantity, unit,
                                    canonical_name, section, optional, position)
    select v_new, v_book, i.display_text, i.quantity, i.unit, i.canonical_name, i.section,
           i.optional, i.position
      from public.ingredients i where i.recipe_id = r.id;
    insert into public.steps (recipe_id, book_id, position, text)
    select v_new, v_book, s.position, s.text from public.steps s where s.recipe_id = r.id;
    insert into public.share_copies (share_id, from_recipe_id, to_recipe_id)
    values (v_share.id, r.id, v_new);
    v_count := v_count + 1;
  end loop;

  update public.shares set status = 'accepted', added_count = v_count where id = v_share.id;
  return v_count;
end;
$$;
revoke all on function public.accept_share(uuid, uuid[]) from public, anon;
grant execute on function public.accept_share(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------- photos

-- A Storage object the caller may read because it's a photo of a recipe
-- shared with them that hasn't been copied into their book yet.
create function private.is_shared_photo(p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.share_copies sc
      join public.shares s on s.id = sc.share_id
      join public.recipes r on r.id = sc.from_recipe_id
     where sc.from_recipe_id = private.try_uuid((storage.foldername(p_name))[2])
       and r.book_id = private.try_uuid((storage.foldername(p_name))[1])
       and not sc.images_copied
       and s.status = 'accepted'
       and s.to_email = private.my_email()
  );
$$;
revoke all on function private.is_shared_photo(text) from public, anon;
grant execute on function private.is_shared_photo(text) to authenticated;

create policy "recipe-images: read photos shared with me" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-images' and private.is_shared_photo(name));

-- The photos still to copy for an accepted share: where each one is, and
-- which of the recipient's recipes it goes to.
create function public.share_photos(p_share uuid)
returns table (from_recipe_id uuid, to_recipe_id uuid, to_book_id uuid, storage_path text,
               "position" integer, credit_name text, credit_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select sc.from_recipe_id, sc.to_recipe_id, t.book_id, i.storage_path, i.position,
         i.credit_name, i.credit_url
    from public.share_copies sc
    join public.shares s on s.id = sc.share_id
    join public.recipes t on t.id = sc.to_recipe_id
    left join public.recipe_images i on i.recipe_id = sc.from_recipe_id
   where sc.share_id = p_share
     and not sc.images_copied
     and s.status = 'accepted'
     and s.to_email = private.my_email()
   order by sc.from_recipe_id, i.position;
$$;
revoke all on function public.share_photos(uuid) from public, anon;
grant execute on function public.share_photos(uuid) to authenticated;

-- Marks recipes' photos as copied; their originals can't be read any more.
create function public.share_photos_done(p_share uuid, p_from_recipe_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.share_copies sc set images_copied = true
    from public.shares s
   where s.id = sc.share_id and sc.share_id = p_share
     and sc.from_recipe_id = any (p_from_recipe_ids)
     and s.to_email = private.my_email();
$$;
revoke all on function public.share_photos_done(uuid, uuid[]) from public, anon;
grant execute on function public.share_photos_done(uuid, uuid[]) to authenticated;
