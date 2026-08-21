-- Connect phone-based Supabase Auth users to the existing worker roster.
-- Additive migration: existing workers, members, labor records and reports are preserved.

alter table public.company_workers add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists company_workers_user_id_idx on public.company_workers(user_id) where user_id is not null;

create or replace function public.normalized_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if length(digits) = 10 then return '+1' || digits; end if;
  if length(digits) = 11 and left(digits, 1) = '1' then return '+' || digits; end if;
  if left(trim(coalesce(p_phone, '')), 1) = '+' and length(digits) between 8 and 15 then return '+' || digits; end if;
  return null;
end;
$$;

create or replace function public.claim_worker_membership()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_phone text;
  linked_count integer := 0;
begin
  select public.normalized_phone(phone) into current_phone
  from auth.users
  where id = auth.uid();

  if current_phone is null then return 0; end if;

  insert into public.company_members (company_id, user_id, full_name, email, role, is_active)
  select w.company_id, auth.uid(), w.full_name, coalesce(w.email, u.email), 'foreman_employee', true
  from public.company_workers w
  join auth.users u on u.id = auth.uid()
  where w.is_active = true
    and public.normalized_phone(w.phone) = current_phone
  on conflict (company_id, user_id) do update
  set full_name = excluded.full_name,
      email = coalesce(excluded.email, public.company_members.email),
      is_active = true;

  update public.company_workers
  set user_id = auth.uid()
  where is_active = true
    and public.normalized_phone(phone) = current_phone;

  get diagnostics linked_count = row_count;
  return linked_count;
end;
$$;

revoke all on function public.claim_worker_membership() from public;
grant execute on function public.claim_worker_membership() to authenticated;
