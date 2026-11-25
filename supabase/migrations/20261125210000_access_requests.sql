-- New accounts wait for the app owner's approval.
--
-- Anyone can open an account, but until an admin approves it, it can't
-- read or change anything: private.member_role (which every book, recipe,
-- photo, import and AI rule goes through) now also requires an approved
-- profile, and so do shares and the AI quota. Accounts that exist when
-- this runs are approved. Admins are listed in public.app_admins, which
-- only the server owner can change (service role or SQL); the app owner's
-- account is added there by hand, not in this repo.

alter table public.profiles
  add column approved_at timestamptz,
  add column approved_by uuid references public.profiles (id) on delete set null,
  add column rejected_at timestamptz;

update public.profiles set approved_at = now() where approved_at is null;

create table public.app_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies and no grants: app users can't read or change the list.
revoke all on public.app_admins from anon, authenticated;

create function private.is_approved(p_user uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.approved_at is not null);
$$;

create function private.is_app_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()))
     and private.is_approved((select auth.uid()));
$$;

revoke all on function private.is_approved(uuid), private.is_app_admin() from public, anon;
grant execute on function private.is_approved(uuid), private.is_app_admin() to authenticated;

-- Membership counts only for approved accounts.
create or replace function private.member_role(p_book uuid) returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
    from public.book_members m
   where m.book_id = p_book
     and m.user_id = (select auth.uid())
     and m.revoked_at is null
     and private.is_approved(m.user_id);
$$;

-- Shares reach only approved accounts.
create or replace function private.my_email() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
    from auth.users u
   where u.id = (select auth.uid()) and u.email_confirmed_at is not null
     and private.is_approved(u.id);
$$;

-- The AI only for approved accounts (the ai function passes the user id).
create or replace function public.ai_take_quota(p_book uuid, p_user uuid) returns text
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
   where m.book_id = p_book and m.user_id = p_user and m.revoked_at is null
     and private.is_approved(p_user);
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

-- The signed-in user's own standing: approved, pending or rejected; and
-- whether they're an admin (to show the requests page).
create function public.my_access() returns table (status text, is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.approved_at is not null then 'approved'
              when p.rejected_at is not null then 'rejected'
              else 'pending' end,
         private.is_app_admin()
    from public.profiles p
   where p.id = (select auth.uid());
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- Admins: who asked to join, newest first (pending first).
create function public.access_requests()
returns table (user_id uuid, email text, display_name text, requested_at timestamptz,
               status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_app_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return query
    select p.id, p.email, p.display_name, p.created_at,
           case when p.approved_at is not null then 'approved'
                when p.rejected_at is not null then 'rejected'
                else 'pending' end
      from public.profiles p
     where p.approved_at is null or p.approved_at > now() - interval '30 days'
     order by (p.approved_at is null and p.rejected_at is null) desc, p.created_at desc
     limit 200;
end;
$$;
revoke all on function public.access_requests() from public, anon;
grant execute on function public.access_requests() to authenticated;

-- Admins: approve or turn down a request (a turned-down one can be
-- approved later).
create function public.decide_access(p_user uuid, p_approve boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_app_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  update public.profiles
     set approved_at = case when p_approve then coalesce(approved_at, now()) else null end,
         approved_by = case when p_approve then coalesce(approved_by, (select auth.uid())) else null end,
         rejected_at = case when p_approve then null else now() end
   where id = p_user and id <> (select auth.uid());
end;
$$;
revoke all on function public.decide_access(uuid, boolean) from public, anon;
grant execute on function public.decide_access(uuid, boolean) to authenticated;
