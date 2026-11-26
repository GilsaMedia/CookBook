-- Sharing by link: instead of an email address, the owner gets a link to
-- send any way they like (WhatsApp, SMS…). Each link is for one person:
-- the first approved account to open it claims the share (it becomes
-- addressed to that account's email), and from then on it works like any
-- share. Only a hash of the link's token is stored.

alter table public.shares alter column to_email drop not null;
alter table public.shares
  add column token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  add column claimed_at timestamptz;
alter table public.shares
  add constraint shares_to_someone check (to_email is not null or token_hash is not null);

-- Opening a link: claims its share for the caller (approved accounts only),
-- or finds it again if they already did. Returns the share's id.
create function public.claim_share(p_token text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.shares;
  v_email text := private.my_email();
begin
  if v_email is null then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  select * into v_share from public.shares s
   where s.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_share.to_email is not null then
    if v_share.to_email = v_email then
      return v_share.id;
    end if;
    raise exception 'link_used' using errcode = 'P0001';
  end if;
  if v_share.status <> 'pending' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_share.from_user = (select auth.uid()) then
    raise exception 'share_self' using errcode = 'P0001';
  end if;
  update public.shares set to_email = v_email, claimed_at = now() where id = v_share.id;
  return v_share.id;
end;
$$;
revoke all on function public.claim_share(text) from public, anon;
grant execute on function public.claim_share(text) to authenticated;
