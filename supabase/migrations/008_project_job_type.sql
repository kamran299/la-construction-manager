alter table public.projects
  add column if not exists project_type text not null default 'new-construction'
  check (project_type in (
    'new-construction',
    'whole-home-remodel',
    'kitchen-remodel',
    'bathroom-remodel',
    'flooring-remodel',
    'kitchen-bath-flooring'
  ));

drop policy if exists "Managers can replace project phases" on public.project_phases;
create policy "Managers can replace project phases"
  on public.project_phases for delete
  to authenticated
  using (
    exists (
      select 1
      from public.projects project
      join public.company_members membership on membership.company_id = project.company_id
      where project.id = project_phases.project_id
        and membership.user_id = auth.uid()
        and membership.is_active = true
        and membership.role in ('owner_admin', 'project_manager')
    )
  );

grant delete on public.project_phases to authenticated;
