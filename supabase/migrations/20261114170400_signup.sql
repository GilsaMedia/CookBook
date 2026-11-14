-- On signup: create the profile, a book, the owner membership and the
-- default categories (PRD Appendix A). A Doc/PDF import later renames or
-- extends the categories from the Doc's own headings (PRD §7.3).

create function private.seed_default_categories(p_book uuid) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (book_id, name, position)
  select p_book, c.name, c.position
    from unnest(array[
      'מרקים',
      'סלטים',
      'מנות עיקריות – בשר ועוף',
      'דגים',
      'צמחוני וטבעוני',
      'תוספות',
      'פסטה ואורז',
      'מאפים ולחמים',
      'עוגות',
      'קינוחים ועוגיות',
      'ממרחים ורטבים'
    ]) with ordinality as c(name, position);
$$;

create function private.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_book uuid;
  name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(new.email, '@', 1)
  );
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, name);

  insert into public.books (name)
  values ('ספר המתכונים')
  returning id into new_book;

  insert into public.book_members (book_id, user_id, role)
  values (new_book, new.id, 'owner');

  perform private.seed_default_categories(new_book);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

revoke all on function private.seed_default_categories(uuid), private.handle_new_user()
  from public, anon, authenticated;
