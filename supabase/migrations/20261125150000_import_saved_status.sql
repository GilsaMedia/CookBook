-- Items already saved into the book: a reopened job (retrying what failed)
-- must not offer them again. Its own migration, because a new enum value
-- can't be used in the transaction that adds it.
alter type public.import_item_status add value 'saved';
