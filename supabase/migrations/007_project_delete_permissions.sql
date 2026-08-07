-- Allow only company owners/admins to permanently delete projects.
-- Related phases, tasks, and file records are removed by existing cascade rules.

drop policy if exists "Managers can delete projects" on public.projects;
create policy "Managers can delete projects"
  on public.projects for delete
  to authenticated
  using (
    exists (
      select 1
      from public.company_members membership
      where membership.company_id = projects.company_id
        and membership.user_id = auth.uid()
        and membership.is_active = true
        and membership.role = 'owner_admin'
    )
  );

grant delete on public.projects to authenticated;
