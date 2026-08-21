-- Independent operations hub. Additive only: no existing report, task, project,
-- file, or summary data is deleted or rewritten. Safe to run more than once.

alter table public.project_files add column if not exists description text;
alter table public.project_files add column if not exists document_date date;
alter table public.project_files add column if not exists location text;

create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  legacy_key text,
  details text not null check (char_length(trim(details)) > 0),
  task_type text not null default 'work' check (task_type in ('work', 'material', 'inspection')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_name text,
  due_date date,
  source_date date not null default current_date,
  source text not null default 'manual',
  completion_evidence text,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_tasks_company_legacy_key_idx on public.work_tasks(company_id, legacy_key);
create index if not exists work_tasks_company_status_idx on public.work_tasks(company_id, status, due_date);

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(trim(title)) > 0),
  event_type text not null default 'work' check (event_type in ('work', 'inspection', 'delivery', 'meeting', 'other')),
  event_date date not null,
  start_time time,
  end_time time,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_name text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists schedule_events_company_date_idx on public.schedule_events(company_id, event_date);

create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.work_tasks(id) on delete set null,
  item_name text not null check (char_length(trim(item_name)) > 0),
  quantity text,
  vendor text,
  order_number text,
  needed_by date,
  status text not null default 'needed' check (status in ('needed', 'ordered', 'delivered', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists material_orders_company_status_idx on public.material_orders(company_id, status, needed_by);
create unique index if not exists material_orders_task_id_idx on public.material_orders(task_id);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.work_tasks(id) on delete set null,
  inspection_type text not null check (char_length(trim(inspection_type)) > 0),
  scheduled_date date not null,
  scheduled_time time,
  status text not null default 'scheduled' check (status in ('scheduled', 'passed', 'failed', 'cancelled')),
  inspector text,
  notes text,
  correction_due date,
  legacy_key text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists inspections_company_legacy_key_idx on public.inspections(company_id, legacy_key);
create index if not exists inspections_company_date_idx on public.inspections(company_id, scheduled_date, status);

create table if not exists public.labor_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  member_id uuid references auth.users(id) on delete set null,
  employee_name text not null check (char_length(trim(employee_name)) > 0),
  work_date date not null default current_date,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  trade text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists labor_entries_company_date_idx on public.labor_entries(company_id, work_date desc);

create table if not exists public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name text not null check (char_length(trim(company_name)) > 0),
  contact_name text,
  trade text,
  phone text,
  email text,
  insurance_expiry date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subcontractors_company_name_idx on public.subcontractors(company_id, company_name);

create or replace function public.touch_operations_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['work_tasks','schedule_events','material_orders','inspections','labor_entries','subcontractors'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_operations_updated_at()', table_name || '_updated_at', table_name);
  end loop;
end $$;

alter table public.work_tasks enable row level security;
alter table public.schedule_events enable row level security;
alter table public.material_orders enable row level security;
alter table public.inspections enable row level security;
alter table public.labor_entries enable row level security;
alter table public.subcontractors enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['work_tasks','schedule_events','material_orders','inspections','labor_entries','subcontractors'] loop
    execute format('drop policy if exists "Members can view %s" on public.%I', table_name, table_name);
    execute format('create policy "Members can view %s" on public.%I for select to authenticated using (public.is_active_company_member(company_id))', table_name, table_name);
    execute format('drop policy if exists "Managers can add %s" on public.%I', table_name, table_name);
    execute format('create policy "Managers can add %s" on public.%I for insert to authenticated with check (public.is_company_manager(company_id))', table_name, table_name);
    execute format('drop policy if exists "Managers can update %s" on public.%I', table_name, table_name);
    execute format('create policy "Managers can update %s" on public.%I for update to authenticated using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id))', table_name, table_name);
    execute format('drop policy if exists "Managers can delete %s" on public.%I', table_name, table_name);
    execute format('create policy "Managers can delete %s" on public.%I for delete to authenticated using (public.is_company_manager(company_id))', table_name, table_name);
  end loop;
end $$;

-- Employees may record or correct their own labor without receiving manager access.
drop policy if exists "Employees can add own labor" on public.labor_entries;
create policy "Employees can add own labor" on public.labor_entries for insert to authenticated
with check (public.is_active_company_member(company_id) and member_id = auth.uid());
drop policy if exists "Employees can update own labor" on public.labor_entries;
create policy "Employees can update own labor" on public.labor_entries for update to authenticated
using (member_id = auth.uid()) with check (member_id = auth.uid() and public.is_active_company_member(company_id));

grant select, insert, update, delete on public.work_tasks, public.schedule_events, public.material_orders, public.inspections, public.labor_entries, public.subcontractors to authenticated;

-- Photos attached to daily reports are kept separately so every existing report
-- remains unchanged. Storage is private and access follows report membership.
create table if not exists public.report_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- An earlier unfinished photo feature may already have created report_photos
-- with only report_id/storage_path/caption. Extend that table in place and
-- keep any rows instead of replacing it.
alter table public.report_photos add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.report_photos add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.report_photos add column if not exists file_name text;
alter table public.report_photos add column if not exists mime_type text;
alter table public.report_photos add column if not exists file_size bigint default 0;
alter table public.report_photos add column if not exists uploaded_by uuid references auth.users(id) on delete set null;
alter table public.report_photos add column if not exists created_at timestamptz default now();

update public.report_photos photo
set company_id = coalesce(photo.company_id, report.company_id),
    project_id = coalesce(photo.project_id, report.project_id),
    file_name = coalesce(nullif(photo.file_name, ''), nullif(regexp_replace(photo.storage_path, '^.*/', ''), ''), 'report-photo'),
    file_size = coalesce(photo.file_size, 0),
    uploaded_by = coalesce(photo.uploaded_by, report.reporter_id),
    created_at = coalesce(photo.created_at, report.created_at, now())
from public.daily_reports report
where report.id = photo.report_id
  and (photo.company_id is null or photo.file_name is null or photo.file_size is null or photo.uploaded_by is null or photo.created_at is null);

alter table public.report_photos alter column company_id set not null;
alter table public.report_photos alter column file_name set not null;
alter table public.report_photos alter column file_size set default 0;
alter table public.report_photos alter column file_size set not null;
alter table public.report_photos alter column uploaded_by set default auth.uid();
alter table public.report_photos alter column created_at set default now();
alter table public.report_photos alter column created_at set not null;
create unique index if not exists report_photos_storage_path_idx on public.report_photos(storage_path);
create index if not exists report_photos_company_report_idx on public.report_photos(company_id, report_id, created_at);

create or replace function public.can_access_report_photo(
  report_uuid_text text,
  company_uuid_text text default null,
  write_access boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports r
    join public.company_members m on m.company_id = r.company_id
    where r.id::text = report_uuid_text
      and (company_uuid_text is null or r.company_id::text = company_uuid_text)
      and m.user_id = auth.uid()
      and m.is_active = true
      and (
        not write_access
        or r.reporter_id = auth.uid()
        or m.role in ('owner_admin', 'project_manager')
      )
  );
$$;

revoke all on function public.can_access_report_photo(text, text, boolean) from public;
grant execute on function public.can_access_report_photo(text, text, boolean) to authenticated;

alter table public.report_photos enable row level security;
drop policy if exists "Company members can view report photos" on public.report_photos;
create policy "Company members can view report photos" on public.report_photos for select to authenticated
using (public.can_access_report_photo(report_id::text, company_id::text));
drop policy if exists "Report owners can add report photos" on public.report_photos;
create policy "Report owners can add report photos" on public.report_photos for insert to authenticated
with check (uploaded_by = auth.uid() and public.can_access_report_photo(report_id::text, company_id::text, true));
drop policy if exists "Report owners can delete report photos" on public.report_photos;
create policy "Report owners can delete report photos" on public.report_photos for delete to authenticated
using (public.can_access_report_photo(report_id::text, company_id::text, true));
grant select, insert, delete on public.report_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 20971520, array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Company members can read stored report photos" on storage.objects;
create policy "Company members can read stored report photos" on storage.objects for select to authenticated
using (
  bucket_id = 'report-photos'
  and public.can_access_report_photo((storage.foldername(name))[2], (storage.foldername(name))[1])
);
drop policy if exists "Report owners can upload stored report photos" on storage.objects;
create policy "Report owners can upload stored report photos" on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-photos'
  and public.can_access_report_photo((storage.foldername(name))[2], (storage.foldername(name))[1], true)
);
drop policy if exists "Report owners can delete stored report photos" on storage.objects;
create policy "Report owners can delete stored report photos" on storage.objects for delete to authenticated
using (
  bucket_id = 'report-photos'
  and public.can_access_report_photo((storage.foldername(name))[2], (storage.foldername(name))[1], true)
);
