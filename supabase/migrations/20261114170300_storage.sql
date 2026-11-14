-- Private bucket for recipe photos. Object paths are
--   <book_id>/<recipe_id>/<file>
-- and the policies mirror the recipe tables: you can read an object only if
-- you can read its recipe, and write it only if you can edit the recipe.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']
);

-- Parses a path segment as a uuid; null instead of an error for anything else.
create function private.try_uuid(p text) returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- The recipe an object path belongs to, if the path is well formed and the
-- recipe really is in the book named by the first segment.
create function private.recipe_for_object(p_name text) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
    from public.recipes r
   where r.id = private.try_uuid((storage.foldername(p_name))[2])
     and r.book_id = private.try_uuid((storage.foldername(p_name))[1]);
$$;

revoke all on function private.try_uuid(text), private.recipe_for_object(text) from public, anon;
grant execute on function private.try_uuid(text), private.recipe_for_object(text) to authenticated;

create policy "recipe-images: read with recipe" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
    -- Subject to the recipes RLS policies, like the child tables.
    and exists (
      select 1 from public.recipes r
       where r.id = private.recipe_for_object(name)
    )
  );

create policy "recipe-images: editors upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and private.can_edit_recipe(private.recipe_for_object(name))
  );

create policy "recipe-images: editors update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and private.can_edit_recipe(private.recipe_for_object(name))
  )
  with check (
    bucket_id = 'recipe-images'
    and private.can_edit_recipe(private.recipe_for_object(name))
  );

create policy "recipe-images: editors delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and private.can_edit_recipe(private.recipe_for_object(name))
  );
