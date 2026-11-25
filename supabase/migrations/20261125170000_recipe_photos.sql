-- A photo for every recipe.
--
-- 1. Photos found on the web carry a credit: the site's name and the page
--    the photo came from.
-- 2. "Find photos" jobs: one item per recipe without a photo; the worker
--    finds a photo and adds it to the recipe itself, so the job needs no
--    review and finishes as imported.
-- 3. Import items can take more than one step (read the recipe, look it up
--    online when the document has only its title, find its photo): a step
--    that hands over to the next goes back to the queue at once
--    (error 'next'), without using an attempt.

alter table public.recipe_images
  add column credit_name text check (length(credit_name) <= 200),
  add column credit_url text check (length(credit_url) <= 2048 and credit_url ~ '^https?://');

alter table public.import_jobs drop constraint import_jobs_format_check;
alter table public.import_jobs add constraint import_jobs_format_check
  check (format in ('docx', 'keep', 'photos'));

alter table public.import_items drop constraint import_items_task_check;
alter table public.import_items add constraint import_items_task_check
  check (task in ('structure_recipe', 'import_url', 'none', 'find_photo'));

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
         attempts = case when p_status = 'queued' and p_error in ('busy', 'next') then greatest(attempts - 1, 0) else attempts end,
         retry_at = case
           when p_status <> 'queued' or p_error = 'next' then null
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
           -- Photos are already in place: nothing to review.
           then (case when j.format = 'photos' then 'imported' else 'ready' end)::public.import_job_status
           else j.status end
   where j.id = v_job;
end;
$$;
