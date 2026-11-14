-- Row-Level Security: a row is visible only through a non-revoked
-- membership in its book. Writes depend on the member's role:
--   owner        everything in the book
--   contributor  inserts own pending rows, edits/deletes own rows until approved
--   viewer       read-only, and only approved recipes
-- Helpers live in the unexposed `private` schema.

-- ---------------------------------------------------------------- helpers

-- The caller's active role in a book, or null (not a member / revoked).
create function private.member_role(p_book uuid) returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
    from public.book_members m
   where m.book_id = p_book
     and m.user_id = (select auth.uid())
     and m.revoked_at is null;
$$;

create function private.is_member(p_book uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.member_role(p_book) is not null;
$$;

create function private.is_owner(p_book uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.member_role(p_book) = 'owner', false);
$$;

-- Owner of the recipe's book, or the contributor who wrote it while it is
-- not yet approved.
create function private.can_edit_recipe(p_recipe uuid) returns boolean
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
           and r.status <> 'approved'
         )
       )
  );
$$;

-- Owners see their members' profiles; members see their books' owners.
create function private.can_see_profile(p_profile uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile = (select auth.uid())
      or exists (
        select 1
          from public.book_members me
          join public.book_members them on them.book_id = me.book_id
         where me.user_id = (select auth.uid())
           and me.revoked_at is null
           and them.user_id = p_profile
           and (me.role = 'owner' or (them.role = 'owner' and them.revoked_at is null))
      );
$$;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on function
  private.member_role(uuid),
  private.is_member(uuid),
  private.is_owner(uuid),
  private.can_edit_recipe(uuid),
  private.can_see_profile(uuid)
to authenticated;

-- The recipe search trigger calls a private helper that users can't execute
-- directly; run the trigger as its owner so inserts by members still work.
alter function private.recipes_set_search_text() security definer;

-- TRUNCATE ignores RLS; nobody but the service role needs it.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ---------------------------------------------------------------- profiles

create policy "profiles: read own and related" on public.profiles
  for select to authenticated
  using (private.can_see_profile(id));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Profiles are created by the signup trigger; users may only change their name.
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------- books

create policy "books: members read" on public.books
  for select to authenticated
  using (private.is_member(id));

create policy "books: owner updates" on public.books
  for update to authenticated
  using (private.is_owner(id))
  with check (private.is_owner(id));

-- Books are created by the signup trigger; deletion comes later (PLAN §6).
revoke insert, delete on public.books from authenticated;

-- ---------------------------------------------------------------- book_members

create policy "book_members: own row or owner reads" on public.book_members
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and revoked_at is null)
    or private.is_owner(book_id)
  );

create policy "book_members: owner adds non-owners" on public.book_members
  for insert to authenticated
  with check (private.is_owner(book_id) and role <> 'owner');

create policy "book_members: owner changes non-owners" on public.book_members
  for update to authenticated
  using (private.is_owner(book_id) and role <> 'owner')
  with check (private.is_owner(book_id) and role <> 'owner');

create policy "book_members: owner removes non-owners" on public.book_members
  for delete to authenticated
  using (private.is_owner(book_id) and role <> 'owner');

-- ---------------------------------------------------------------- categories

create policy "categories: members read" on public.categories
  for select to authenticated
  using (private.is_member(book_id));

create policy "categories: owner inserts" on public.categories
  for insert to authenticated
  with check (private.is_owner(book_id));

create policy "categories: owner updates" on public.categories
  for update to authenticated
  using (private.is_owner(book_id))
  with check (private.is_owner(book_id));

create policy "categories: owner deletes" on public.categories
  for delete to authenticated
  using (private.is_owner(book_id));

-- ---------------------------------------------------------------- recipes

create policy "recipes: read by role" on public.recipes
  for select to authenticated
  using (
    status = 'approved' and private.is_member(book_id)
    or private.is_owner(book_id)
    or (private.member_role(book_id) = 'contributor' and created_by = (select auth.uid()))
  );

create policy "recipes: owner inserts" on public.recipes
  for insert to authenticated
  with check (private.is_owner(book_id));

create policy "recipes: contributor inserts own pending" on public.recipes
  for insert to authenticated
  with check (
    private.member_role(book_id) = 'contributor'
    and created_by = (select auth.uid())
    and status in ('draft', 'pending')
  );

create policy "recipes: owner updates" on public.recipes
  for update to authenticated
  using (private.is_owner(book_id))
  with check (private.is_owner(book_id));

create policy "recipes: contributor edits own until approved" on public.recipes
  for update to authenticated
  using (
    private.member_role(book_id) = 'contributor'
    and created_by = (select auth.uid())
    and status <> 'approved'
  )
  with check (
    private.member_role(book_id) = 'contributor'
    and created_by = (select auth.uid())
    and status in ('draft', 'pending')
  );

create policy "recipes: owner deletes" on public.recipes
  for delete to authenticated
  using (private.is_owner(book_id));

create policy "recipes: contributor deletes own until approved" on public.recipes
  for delete to authenticated
  using (
    private.member_role(book_id) = 'contributor'
    and created_by = (select auth.uid())
    and status <> 'approved'
  );

-- ---------------------------------------------------------------- recipe children
-- Visible exactly when the parent recipe is visible: the EXISTS subquery is
-- itself filtered by the recipes policies above. Writable by whoever may
-- edit the parent recipe.

create policy "ingredients: read with recipe" on public.ingredients
  for select to authenticated
  using (private.is_member(book_id) and exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "ingredients: editors insert" on public.ingredients
  for insert to authenticated with check (private.can_edit_recipe(recipe_id));
create policy "ingredients: editors update" on public.ingredients
  for update to authenticated
  using (private.can_edit_recipe(recipe_id)) with check (private.can_edit_recipe(recipe_id));
create policy "ingredients: editors delete" on public.ingredients
  for delete to authenticated using (private.can_edit_recipe(recipe_id));

create policy "steps: read with recipe" on public.steps
  for select to authenticated
  using (private.is_member(book_id) and exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "steps: editors insert" on public.steps
  for insert to authenticated with check (private.can_edit_recipe(recipe_id));
create policy "steps: editors update" on public.steps
  for update to authenticated
  using (private.can_edit_recipe(recipe_id)) with check (private.can_edit_recipe(recipe_id));
create policy "steps: editors delete" on public.steps
  for delete to authenticated using (private.can_edit_recipe(recipe_id));

create policy "recipe_images: read with recipe" on public.recipe_images
  for select to authenticated
  using (private.is_member(book_id) and exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "recipe_images: editors insert" on public.recipe_images
  for insert to authenticated with check (private.can_edit_recipe(recipe_id));
create policy "recipe_images: editors update" on public.recipe_images
  for update to authenticated
  using (private.can_edit_recipe(recipe_id)) with check (private.can_edit_recipe(recipe_id));
create policy "recipe_images: editors delete" on public.recipe_images
  for delete to authenticated using (private.can_edit_recipe(recipe_id));

-- ---------------------------------------------------------------- invites (owner only)

create policy "invites: owner reads" on public.invites
  for select to authenticated using (private.is_owner(book_id));
create policy "invites: owner creates" on public.invites
  for insert to authenticated
  with check (private.is_owner(book_id) and invited_by = (select auth.uid()));
create policy "invites: owner updates" on public.invites
  for update to authenticated
  using (private.is_owner(book_id)) with check (private.is_owner(book_id));
create policy "invites: owner deletes" on public.invites
  for delete to authenticated using (private.is_owner(book_id));

-- ---------------------------------------------------------------- preferences

create policy "preferences: members read" on public.preferences
  for select to authenticated using (private.is_member(book_id));
create policy "preferences: owner inserts" on public.preferences
  for insert to authenticated with check (private.is_owner(book_id));
create policy "preferences: owner updates" on public.preferences
  for update to authenticated
  using (private.is_owner(book_id)) with check (private.is_owner(book_id));
create policy "preferences: owner deletes" on public.preferences
  for delete to authenticated using (private.is_owner(book_id));
