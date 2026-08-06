-- Dashboard foundation: companies, memberships, and projects.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (
    role in ('owner_admin', 'project_manager', 'foreman_employee', 'viewer')
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  address text,
  current_phase text not null default 'Preconstruction',
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists company_members_user_id_idx
  on public.company_members(user_id);
create index if not exists projects_company_id_idx
  on public.projects(company_id);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.projects enable row level security;

drop policy if exists "Members can view their companies" on public.companies;
create policy "Members can view their companies"
  on public.companies for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members membership
      where membership.company_id = companies.id
        and membership.user_id = auth.uid()
        and membership.is_active = true
    )
  );

drop policy if exists "Users can view their memberships" on public.company_members;
create policy "Users can view their memberships"
  on public.company_members for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members can view company projects" on public.projects;
create policy "Members can view company projects"
  on public.projects for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members membership
      where membership.company_id = projects.company_id
        and membership.user_id = auth.uid()
        and membership.is_active = true
    )
  );

grant select on public.companies, public.company_members, public.projects to authenticated;

do $$
declare
  owner_user_id uuid;
  company_uuid uuid;
begin
  select id into owner_user_id
  from auth.users
  where lower(email) = lower('kamran@ava-construction.com')
  limit 1;

  if owner_user_id is null then
    raise exception 'User kamran@ava-construction.com was not found in Authentication';
  end if;

  select company_id into company_uuid
  from public.company_members
  where user_id = owner_user_id and is_active = true
  limit 1;

  if company_uuid is null then
    insert into public.companies (name, created_by)
    values ('L&A Custom Homes', owner_user_id)
    returning id into company_uuid;

    insert into public.company_members (company_id, user_id, role)
    values (company_uuid, owner_user_id, 'owner_admin');
  end if;
end $$;
