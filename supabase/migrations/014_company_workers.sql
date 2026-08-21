-- Worker roster for employees who do not yet have an application login.
-- Existing company members and labor records are unchanged.

create table if not exists public.company_workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) > 0),
  phone text,
  email text,
  trade text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_workers_company_name_idx on public.company_workers(company_id, full_name);
drop trigger if exists company_workers_updated_at on public.company_workers;
create trigger company_workers_updated_at before update on public.company_workers
for each row execute function public.touch_operations_updated_at();

alter table public.company_workers enable row level security;
drop policy if exists "Members can view company workers" on public.company_workers;
create policy "Members can view company workers" on public.company_workers for select to authenticated
using (public.is_active_company_member(company_id));
drop policy if exists "Managers can add company workers" on public.company_workers;
create policy "Managers can add company workers" on public.company_workers for insert to authenticated
with check (public.is_company_manager(company_id));
drop policy if exists "Managers can update company workers" on public.company_workers;
create policy "Managers can update company workers" on public.company_workers for update to authenticated
using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

grant select, insert, update on public.company_workers to authenticated;

