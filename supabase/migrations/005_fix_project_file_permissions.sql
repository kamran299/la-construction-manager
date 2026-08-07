-- Use security-definer membership checks so Storage policies do not depend on
-- nested row-level-security evaluation. Safe to run more than once.

alter table public.project_files
  add column if not exists category text not null default 'documents';

update public.project_files
set category = case
  when mime_type like 'image/%' then 'photos'
  when lower(file_name) ~ '[.](dwg|dxf)$' then 'plans'
  else category
end
where category = 'documents';

create or replace function public.can_access_project_file(
  project_uuid_text text,
  company_uuid_text text default null,
  manager_only boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.company_members m on m.company_id = p.company_id
    where p.id::text = project_uuid_text
      and (company_uuid_text is null or p.company_id::text = company_uuid_text)
      and m.user_id = auth.uid()
      and m.is_active = true
      and (not manager_only or m.role in ('owner_admin', 'project_manager'))
  );
$$;

revoke all on function public.can_access_project_file(text, text, boolean) from public;
grant execute on function public.can_access_project_file(text, text, boolean) to authenticated;

drop policy if exists "Company members can view project files" on public.project_files;
create policy "Company members can view project files"
  on public.project_files for select to authenticated
  using (public.can_access_project_file(project_id::text));

drop policy if exists "Managers can add project files" on public.project_files;
create policy "Managers can add project files"
  on public.project_files for insert to authenticated
  with check (public.can_access_project_file(project_id::text, null, true));

drop policy if exists "Managers can delete project files" on public.project_files;
create policy "Managers can delete project files"
  on public.project_files for delete to authenticated
  using (public.can_access_project_file(project_id::text, null, true));

drop policy if exists "Company members can read stored project files" on storage.objects;
create policy "Company members can read stored project files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-files'
    and public.can_access_project_file(
      (storage.foldername(name))[2],
      (storage.foldername(name))[1]
    )
  );

drop policy if exists "Managers can upload stored project files" on storage.objects;
create policy "Managers can upload stored project files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and public.can_access_project_file(
      (storage.foldername(name))[2],
      (storage.foldername(name))[1],
      true
    )
  );

drop policy if exists "Managers can delete stored project files" on storage.objects;
create policy "Managers can delete stored project files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-files'
    and public.can_access_project_file(
      (storage.foldername(name))[2],
      (storage.foldername(name))[1],
      true
    )
  );
