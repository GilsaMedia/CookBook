-- A dish goes into a meal once. Duplicates that slipped in before (adding
-- to a saved meal, or swapping to a dish already there) are removed,
-- keeping the earliest.

delete from public.meal_items i
 using public.meal_items j
 where i.meal_id = j.meal_id and i.recipe_id = j.recipe_id
   and (i.position, i.created_at, i.id) > (j.position, j.created_at, j.id);

create unique index meal_items_once on public.meal_items (meal_id, recipe_id);
