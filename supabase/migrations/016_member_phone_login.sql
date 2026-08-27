-- Store a phone login on an existing company account without changing its role.
-- Additive migration: no existing users, workers, reports, or memberships are removed.

alter table public.company_members add column if not exists phone text;
alter table public.company_members add column if not exists login_alias_of uuid references auth.users(id) on delete cascade;

drop index if exists public.company_members_phone_company_idx;
create unique index company_members_phone_company_idx
  on public.company_members (company_id, public.normalized_phone(phone))
  where phone is not null and is_active = true and login_alias_of is null;

create index if not exists company_members_login_alias_idx
  on public.company_members(login_alias_of)
  where login_alias_of is not null;

create or replace function public.claim_member_phone_access()
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

  insert into public.company_members (company_id, user_id, full_name, email, phone, role, is_active, login_alias_of)
  select m.company_id, auth.uid(), m.full_name, m.email, current_phone, m.role, true, m.user_id
  from public.company_members m
  where m.is_active = true
    and m.login_alias_of is null
    and m.user_id <> auth.uid()
    and public.normalized_phone(m.phone) = current_phone
  on conflict (company_id, user_id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone,
      role = excluded.role,
      is_active = true,
      login_alias_of = excluded.login_alias_of;

  get diagnostics linked_count = row_count;
  return linked_count;
end;
$$;

revoke all on function public.claim_member_phone_access() from public;
grant execute on function public.claim_member_phone_access() to authenticated;
