-- A free Supabase project pauses after about a week with little database
-- activity. .github/workflows/keepalive.yml calls this every few days so
-- the family's cookbook stays awake. It reads no table and returns only the
-- server time, so it's safe to expose to signed-out callers.

create function public.keepalive() returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
