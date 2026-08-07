alter table public.company_members add column if not exists full_name text;
alter table public.company_members add column if not exists email text;

update public.company_members m
set full_name = coalesce(m.full_name, u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
    email = coalesce(m.email, u.email)
from auth.users u
where u.id = m.user_id;

create or replace function public.is_active_company_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = auth.uid() and is_active = true
  );
$$;

create or replace function public.is_company_manager(p_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = auth.uid() and is_active = true
      and role in ('owner_admin', 'project_manager')
  );
$$;

drop policy if exists "Members can view own membership" on public.company_members;
drop policy if exists "Users can view their memberships" on public.company_members;
drop policy if exists "Company members can view team" on public.company_members;
create policy "Company members can view team" on public.company_members for select to authenticated
using (public.is_active_company_member(company_id));

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  reporter_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  reporter_name text not null,
  reporter_email text,
  report_date date not null default current_date,
  original_language text not null default 'fa',
  original_text text not null check (char_length(trim(original_text)) > 0),
  english_text text not null,
  english_summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists daily_reports_company_date_idx on public.daily_reports(company_id, report_date desc);
create index if not exists daily_reports_reporter_idx on public.daily_reports(reporter_id, report_date desc);

alter table public.daily_reports enable row level security;
drop policy if exists "Members can view company reports" on public.daily_reports;
create policy "Members can view company reports" on public.daily_reports for select to authenticated
using (public.is_active_company_member(company_id));
drop policy if exists "Members can submit own reports" on public.daily_reports;
create policy "Members can submit own reports" on public.daily_reports for insert to authenticated
with check (reporter_id = auth.uid() and public.is_active_company_member(company_id));
drop policy if exists "Members can update own reports" on public.daily_reports;
create policy "Members can update own reports" on public.daily_reports for update to authenticated
using (reporter_id = auth.uid()) with check (reporter_id = auth.uid());

create table if not exists public.daily_report_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_date date not null,
  english_summary text not null,
  generated_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, report_date)
);

alter table public.daily_report_summaries enable row level security;
drop policy if exists "Members can view daily summaries" on public.daily_report_summaries;
create policy "Members can view daily summaries" on public.daily_report_summaries for select to authenticated
using (public.is_active_company_member(company_id));
drop policy if exists "Managers can create daily summaries" on public.daily_report_summaries;
create policy "Managers can create daily summaries" on public.daily_report_summaries for insert to authenticated
with check (public.is_company_manager(company_id));
drop policy if exists "Managers can update daily summaries" on public.daily_report_summaries;
create policy "Managers can update daily summaries" on public.daily_report_summaries for update to authenticated
using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

grant select on public.company_members to authenticated;
grant select, insert, update on public.daily_reports to authenticated;
grant select, insert, update on public.daily_report_summaries to authenticated;
