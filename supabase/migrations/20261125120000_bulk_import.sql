-- Bulk import (PRD §7.3): a whole Word document or Keep Takeout at once.
-- The browser parses the file and queues one item per recipe; the
-- `import-worker` Edge Function (run every minute by pg_cron on the hosted
-- project) sends each to the AI server and stores the structured result,
-- so the owner can leave and come back. The owner then reviews the batch
-- and saves the recipes. Owners only: imported recipes are approved at once.

-- Keep labels become tags.
alter table public.recipes add column tags text[] not null default '{}';

create type public.import_job_status as enum ('draft', 'queued', 'running', 'ready', 'imported', 'cancelled');
create type public.import_item_status as enum ('queued', 'processing', 'done', 'failed', 'skipped');

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  format text not null check (format in ('docx', 'keep')),
  file_name text not null check (length(file_name) <= 255),
  status public.import_job_status not null default 'draft',
  total integer not null default 0,
  done integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, book_id)
);

create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  book_id uuid not null,
  position integer not null check (position >= 0),
  -- What the file said: title, group (category heading or label), labels,
  -- kind, source, creation date, image file names inside the upload.
  entry jsonb not null,
  -- The AI's job: structure text, import a link, or nothing (empty entries).
  task text not null check (task in ('structure_recipe', 'import_url', 'none')),
  input text not null default '' check (length(input) <= 20000),
  status public.import_item_status not null default 'queued',
  result jsonb,
  error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (job_id, position),
  foreign key (job_id, book_id) references public.import_jobs (id, book_id) on delete cascade
);

create index import_items_queue on public.import_items (status, job_id, position);
create index import_jobs_book on public.import_jobs (book_id, created_at desc);

alter table public.import_jobs enable row level security;
alter table public.import_items enable row level security;

create trigger import_jobs_updated_at before update on public.import_jobs
  for each row execute function private.set_updated_at();
create trigger import_items_updated_at before update on public.import_items
  for each row execute function private.set_updated_at();

-- Only the book's owner sees and manages its imports.
create policy "import_jobs: owner reads" on public.import_jobs
  for select to authenticated using (private.is_owner(book_id));
create policy "import_jobs: owner creates" on public.import_jobs
  for insert to authenticated with check (private.is_owner(book_id) and created_by = auth.uid());
create policy "import_jobs: owner updates" on public.import_jobs
  for update to authenticated using (private.is_owner(book_id)) with check (private.is_owner(book_id));
create policy "import_jobs: owner deletes" on public.import_jobs
  for delete to authenticated using (private.is_owner(book_id));

create policy "import_items: owner reads" on public.import_items
  for select to authenticated using (private.is_owner(book_id));
create policy "import_items: owner adds to a draft job" on public.import_items
  for insert to authenticated with check (
    private.is_owner(book_id)
    and status = 'queued' and result is null and attempts = 0
    and exists (select 1 from public.import_jobs j where j.id = job_id and j.status = 'draft')
  );
create policy "import_items: owner skips" on public.import_items
  for update to authenticated using (private.is_owner(book_id))
  with check (private.is_owner(book_id) and status = 'skipped');
create policy "import_items: owner deletes" on public.import_items
  for delete to authenticated using (private.is_owner(book_id));

-- The owner may only change a job's status, and an item's status to skipped;
-- results and counters are the worker's (service role).
revoke update on public.import_jobs from authenticated;
grant update (status) on public.import_jobs to authenticated;
revoke update on public.import_items from authenticated;
grant update (status) on public.import_items to authenticated;

-- Caps (the AI runs on the owner's subscription): a job needs a book with
-- AI turned on, at most 3 jobs a day per book and 400 entries per job.
create function private.import_jobs_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.ai_access a where a.book_id = new.book_id) then
    raise exception 'ai_not_enabled' using errcode = 'P0001';
  end if;
  if (select count(*) from public.import_jobs j
       where j.book_id = new.book_id and j.created_at > now() - interval '1 day') >= 3 then
    raise exception 'import_limit' using errcode = 'P0001';
  end if;
  new.status := 'draft';
  new.total := 0;
  new.done := 0;
  new.failed := 0;
  return new;
end;
$$;

create trigger import_jobs_guard before insert on public.import_jobs
  for each row execute function private.import_jobs_guard();

create function private.import_items_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.import_items i where i.job_id = new.job_id) >= 400 then
    raise exception 'import_too_large' using errcode = 'P0001';
  end if;
  update public.import_jobs set total = total + 1 where id = new.job_id;
  return new;
end;
$$;

create trigger import_items_guard before insert on public.import_items
  for each row execute function private.import_items_guard();

-- Owners may move a job only along draft → queued, and to cancelled or
-- imported; the worker moves it through running → ready.
create function private.import_jobs_status_guard() returns trigger
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
     ) then
    raise exception 'bad_status_change' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger import_jobs_status_guard before update of status on public.import_jobs
  for each row execute function private.import_jobs_status_guard();

-- The worker's queue. Claims up to p_limit queued items of active jobs
-- (and retries items stuck in processing for 5 minutes, up to 3 attempts).
create function public.claim_import_items(p_limit integer) returns setof public.import_items
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.import_items i
     set status = case when i.attempts >= 3 then 'failed'::public.import_item_status else 'queued' end,
         error = case when i.attempts >= 3 then 'ai_failed' else i.error end
   where i.status = 'processing' and i.updated_at < now() - interval '5 minutes';

  return query
  with next as (
    select i.id
      from public.import_items i
      join public.import_jobs j on j.id = i.job_id
     where i.status = 'queued' and j.status in ('queued', 'running')
     order by j.created_at, i.position
     limit p_limit
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

-- Records one item's outcome and finishes the job when nothing is left.
create function public.finish_import_item(p_id uuid, p_status public.import_item_status, p_result jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job uuid;
begin
  update public.import_items
     set status = p_status, result = p_result, error = p_error
   where id = p_id and status = 'processing'
  returning job_id into v_job;
  if v_job is null then
    return;
  end if;
  update public.import_jobs j
     set done = (select count(*) from public.import_items i where i.job_id = j.id and i.status in ('done', 'skipped')),
         failed = (select count(*) from public.import_items i where i.job_id = j.id and i.status = 'failed'),
         status = case
           when j.status = 'running' and not exists (
             select 1 from public.import_items i where i.job_id = j.id and i.status in ('queued', 'processing'))
           then 'ready'::public.import_job_status else j.status end
   where j.id = v_job;
end;
$$;

revoke execute on function public.claim_import_items(integer) from public, anon, authenticated;
revoke execute on function public.finish_import_item(uuid, public.import_item_status, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_import_items(integer) to service_role;
grant execute on function public.finish_import_item(uuid, public.import_item_status, jsonb, text) to service_role;
