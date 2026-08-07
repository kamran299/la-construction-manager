-- Project photos, plans, and documents. Safe to run more than once.

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_files_project_id_idx
  on public.project_files(project_id);

alter table public.project_files enable row level security;

drop policy if exists "Company members can view project files" on public.project_files;
create policy "Company members can view project files"
  on public.project_files for select to authenticated
  using (exists (
    select 1 from public.projects p
    join public.company_members m on m.company_id = p.company_id
    where p.id = project_files.project_id
      and m.user_id = auth.uid() and m.is_active = true
  ));

drop policy if exists "Managers can add project files" on public.project_files;
create policy "Managers can add project files"
  on public.project_files for insert to authenticated
  with check (exists (
    select 1 from public.projects p
    join public.company_members m on m.company_id = p.company_id
    where p.id = project_files.project_id
      and m.user_id = auth.uid() and m.is_active = true
      and m.role in ('owner_admin', 'project_manager')
  ));

drop policy if exists "Managers can delete project files" on public.project_files;
create policy "Managers can delete project files"
  on public.project_files for delete to authenticated
  using (exists (
    select 1 from public.projects p
    join public.company_members m on m.company_id = p.company_id
    where p.id = project_files.project_id
      and m.user_id = auth.uid() and m.is_active = true
      and m.role in ('owner_admin', 'project_manager')
  ));

grant select, insert, delete on public.project_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do update
set public = false, file_size_limit = 52428800;

drop policy if exists "Company members can read stored project files" on storage.objects;
create policy "Company members can read stored project files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1 from public.projects p
      join public.company_members m on m.company_id = p.company_id
      where p.id::text = (storage.foldername(name))[2]
        and p.company_id::text = (storage.foldername(name))[1]
        and m.user_id = auth.uid() and m.is_active = true
    )
  );

drop policy if exists "Managers can upload stored project files" on storage.objects;
create policy "Managers can upload stored project files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and exists (
      select 1 from public.projects p
      join public.company_members m on m.company_id = p.company_id
      where p.id::text = (storage.foldername(name))[2]
        and p.company_id::text = (storage.foldername(name))[1]
        and m.user_id = auth.uid() and m.is_active = true
        and m.role in ('owner_admin', 'project_manager')
    )
  );

drop policy if exists "Managers can delete stored project files" on storage.objects;
create policy "Managers can delete stored project files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1 from public.projects p
      join public.company_members m on m.company_id = p.company_id
      where p.id::text = (storage.foldername(name))[2]
        and p.company_id::text = (storage.foldername(name))[1]
        and m.user_id = auth.uid() and m.is_active = true
        and m.role in ('owner_admin', 'project_manager')
    )
  );
