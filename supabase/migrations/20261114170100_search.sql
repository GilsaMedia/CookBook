-- Hebrew-friendly search. Postgres has no Hebrew stemmer, so search uses
-- pg_trgm trigrams over a normalized column: niqqud and cantillation marks
-- stripped, final letters folded (ך→כ ם→מ ן→נ ף→פ ץ→צ), punctuation removed,
-- lower-cased. Trigram similarity then handles plurals ("גזרים" ~ "גזר")
-- and small typos.

create function public.normalize_hebrew(input text) returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(
    translate(
      lower(
        -- drop cantillation and niqqud (keeps maqaf U+05BE, which splits words)
        regexp_replace(coalesce(input, ''), '[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]', '', 'g')
      ),
      -- fold final letters; delete geresh, gershayim and quotes so צ'יפס stays one word
      'ךםןףץ׳״''"`',
      'כמנפצ'
    ),
    '[^0-9a-zא-ת]+', ' ', 'g'
  ));
$$;

comment on function public.normalize_hebrew(text) is
  'Normalizes Hebrew text for trigram search. Apply to search queries too.';

-- Title plus every ingredient's canonical name (falls back to display text).
create function private.recipe_search_text(p_recipe_id uuid, p_title text) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.normalize_hebrew(
    coalesce(p_title, '') || ' ' || coalesce(
      (select string_agg(coalesce(i.canonical_name, i.display_text), ' ' order by i.position)
         from public.ingredients i
        where i.recipe_id = p_recipe_id),
      ''
    )
  );
$$;

create function private.recipes_set_search_text() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := private.recipe_search_text(new.id, new.title);
  return new;
end;
$$;

create trigger recipes_search_text
  before insert or update of title on public.recipes
  for each row execute function private.recipes_set_search_text();

-- Ingredient changes refresh the parent recipe. Runs as definer so it only
-- touches search_text, whatever the caller's role.
create function private.ingredients_refresh_search_text() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected uuid[];
begin
  if tg_op = 'INSERT' then
    affected := array[new.recipe_id];
  elsif tg_op = 'DELETE' then
    affected := array[old.recipe_id];
  else
    affected := array[old.recipe_id, new.recipe_id];
  end if;

  update public.recipes r
     set search_text = private.recipe_search_text(r.id, r.title)
   where r.id = any (affected);
  return null;
end;
$$;

create trigger ingredients_search_text
  after insert or update or delete on public.ingredients
  for each row execute function private.ingredients_refresh_search_text();

create index recipes_search_trgm on public.recipes
  using gin (search_text extensions.gin_trgm_ops);

revoke execute on function private.recipe_search_text(uuid, text) from public;
