-- Bulk imports that finish everything (a 211-recipe PDF lost 119 recipes).
--
-- 1. The AI server runs two jobs at a time. Worker runs overlap (pg_cron
--    every minute, plus the app's "start now" call), so claims now share one
--    limit across runs: at most p_limit items are processing at once.
-- 2. "busy" isn't the recipe's fault: it goes back to the queue without
--    using an attempt, after a short wait (retry_at) so the same run doesn't
--    grab it again at once. Outages (ai_unavailable, usage_limit) wait
--    longer each time.
-- 3. retry_import: the owner sends a job's failed items through again.

alter table public.import_items add column retry_at timestamptz;

create or replace function public.claim_import_items(p_limit integer) returns setof public.import_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free integer;
begin
  -- One claim at a time, so two runs can't both see free slots.
  perform pg_advisory_xact_lock(hashtext('public.claim_import_items'));

  update public.import_items i
     set status = case when i.attempts >= 3 then 'failed'::public.import_item_status else 'queued' end,
         error = case when i.attempts >= 3 then 'ai_failed' else i.error end
   where i.status = 'processing' and i.updated_at < now() - interval '5 minutes';

  select greatest(p_limit - count(*), 0)::integer into v_free
    from public.import_items i
   where i.status = 'processing';

  return query
  with next as (
    select i.id
      from public.import_items i
      join public.import_jobs j on j.id = i.job_id
     where i.status = 'queued' and j.status in ('queued', 'running')
       and (i.retry_at is null or i.retry_at <= now())
     order by j.created_at, i.position
     limit v_free
     for update of i skip locked
  )
  update public.import_items i
     set status = 'processing', attempts = i.attempts + 1
    from next
   where i.id = next.id
  returning i.*;

  update public.import_jobs j set status = 'running'
   where j.status = 'queued'
     and exists (select 1 from public.import_items i where i.job_id = j.id and i.status = 'processing');
end;
$$;

create or replace function public.finish_import_item(p_id uuid, p_status public.import_item_status, p_result jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job uuid;
begin
  update public.import_items
     set status = p_status, result = p_result, error = p_error,
         attempts = case when p_status = 'queued' and p_error = 'busy' then greatest(attempts - 1, 0) else attempts end,
         retry_at = case
           when p_status <> 'queued' then null
           when p_error = 'busy' then now() + interval '15 seconds'
           else now() + attempts * interval '2 minutes' end
   where id = p_id and status = 'processing'
  returning job_id into v_job;
  if v_job is null then
    return;
  end if;
  update public.import_jobs j
     set done = (select count(*) from public.import_items i where i.job_id = j.id and i.status in ('done', 'skipped', 'saved')),
         failed = (select count(*) from public.import_items i where i.job_id = j.id and i.status = 'failed'),
         status = case
           when j.status = 'running' and not exists (
             select 1 from public.import_items i where i.job_id = j.id and i.status in ('queued', 'processing'))
           then 'ready'::public.import_job_status else j.status end
   where j.id = v_job;
end;
$$;

-- Owners may also move a finished job back to queued, but only through
-- retry_import (which sets the flag below).
create or replace function private.import_jobs_status_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(auth.role(), '') = 'authenticated'
     and not (
       (old.status = 'draft' and new.status = 'queued')
       or new.status = 'cancelled'
       or (old.status = 'ready' and new.status = 'imported')
       or (old.status in ('ready', 'imported') and new.status = 'queued'
           and current_setting('cookbook.import_retry', true) = 'on')
     ) then
    raise exception 'bad_status_change' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Sends a job's failed items through the AI again. If the job was already
-- saved, what it saved is marked 'saved' so the next review doesn't offer it
-- twice. Returns how many items were queued.
create function public.retry_import(p_job uuid) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book uuid;
  v_status public.import_job_status;
  v_count integer;
begin
  select j.book_id, j.status into v_book, v_status from public.import_jobs j where j.id = p_job;
  if v_book is null or not private.is_owner(v_book) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_status not in ('ready', 'imported') then
    raise exception 'bad_status_change' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ai_access a where a.book_id = v_book) then
    raise exception 'ai_not_enabled' using errcode = 'P0001';
  end if;

  if v_status = 'imported' then
    update public.import_items set status = 'saved' where job_id = p_job and status = 'done';
  end if;
  update public.import_items
     set status = 'queued', result = null, error = null, attempts = 0, retry_at = null
   where job_id = p_job and status = 'failed';
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 0;
  end if;

  perform set_config('cookbook.import_retry', 'on', true);
  update public.import_jobs
     set status = 'queued',
         failed = 0,
         done = (select count(*) from public.import_items i where i.job_id = p_job and i.status in ('done', 'skipped', 'saved'))
   where id = p_job;
  perform set_config('cookbook.import_retry', 'off', true);
  return v_count;
end;
$$;

revoke execute on function public.retry_import(uuid) from public, anon;
grant execute on function public.retry_import(uuid) to authenticated;

-- The owner marks what they saved (so a retry never offers it again) as
-- well as what they skipped.
drop policy "import_items: owner skips" on public.import_items;
create policy "import_items: owner skips or marks saved" on public.import_items
  for update to authenticated using (private.is_owner(book_id))
  with check (private.is_owner(book_id) and status in ('skipped', 'saved'));
