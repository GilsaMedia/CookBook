-- Who may use the AI. The AI runs on the owner's own Claude subscription,
-- and anyone can sign up, so the AI is off for every book until the server
-- owner turns it on here, and it has daily limits.
--
-- Neither table has RLS policies and app users have no grants: only the
-- service role (the `ai` Edge Function, or the owner with SQL) can read or
-- change them. Turn a book on with:
--   insert into public.ai_access (book_id) values ('<book id>');

create table public.ai_access (
  book_id uuid primary key references public.books (id) on delete cascade,
  daily_book_limit integer not null default 30 check (daily_book_limit >= 0),
  daily_user_limit integer not null default 15 check (daily_user_limit >= 0),
  created_at timestamptz not null default now()
);

-- One row per book, member and day. Counts calls only: no prompts, pages
-- or results are ever stored.
create table public.ai_usage (
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default current_date,
  calls integer not null default 0 check (calls >= 0),
  primary key (book_id, user_id, day)
);

create index ai_usage_user_day on public.ai_usage (user_id, day);

alter table public.ai_access enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_access, public.ai_usage from anon, authenticated;

-- Checks every rule and, if all pass, counts the call, in one transaction:
-- the user is a non-revoked owner or contributor of the book, the book is
-- turned on, and neither the book's nor the user's daily limit is reached.
-- Returns 'ok', 'not_member', 'not_enabled', 'book_limit' or 'user_limit'.
create function public.ai_take_quota(p_book uuid, p_user uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_access public.ai_access;
  v_book_calls integer;
  v_user_calls integer;
begin
  select m.role into v_role
    from public.book_members m
   where m.book_id = p_book and m.user_id = p_user and m.revoked_at is null;
  if v_role is null or v_role = 'viewer' then
    return 'not_member';
  end if;

  -- Locks the book's row so concurrent calls can't both slip under a limit.
  select * into v_access from public.ai_access a where a.book_id = p_book for update;
  if not found then
    return 'not_enabled';
  end if;

  select coalesce(sum(u.calls), 0) into v_book_calls
    from public.ai_usage u where u.book_id = p_book and u.day = current_date;
  if v_book_calls >= v_access.daily_book_limit then
    return 'book_limit';
  end if;

  select coalesce(sum(u.calls), 0) into v_user_calls
    from public.ai_usage u where u.user_id = p_user and u.day = current_date;
  if v_user_calls >= v_access.daily_user_limit then
    return 'user_limit';
  end if;

  insert into public.ai_usage (book_id, user_id, day, calls)
  values (p_book, p_user, current_date, 1)
  on conflict (book_id, user_id, day) do update set calls = public.ai_usage.calls + 1;
  return 'ok';
end;
$$;

revoke execute on function public.ai_take_quota(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_take_quota(uuid, uuid) to service_role;
