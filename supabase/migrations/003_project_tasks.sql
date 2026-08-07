create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.project_phases(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  responsible_trade text not null default 'General Contractor',
  duration_days integer not null default 1 check (duration_days > 0),
  weight numeric(8,2) not null default 1 check (weight > 0),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  created_at timestamptz not null default now(),
  unique (phase_id, name)
);

create index if not exists project_tasks_phase_id_idx
  on public.project_tasks(phase_id);

alter table public.project_tasks enable row level security;

drop policy if exists "Company members can view project tasks" on public.project_tasks;
create policy "Company members can view project tasks"
  on public.project_tasks for select
  to authenticated
  using (
    exists (
      select 1
      from public.project_phases ph
      join public.projects p on p.id = ph.project_id
      join public.company_members m on m.company_id = p.company_id
      where ph.id = project_tasks.phase_id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
  );

drop policy if exists "Managers can create project tasks" on public.project_tasks;
create policy "Managers can create project tasks"
  on public.project_tasks for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.project_phases ph
      join public.projects p on p.id = ph.project_id
      join public.company_members m on m.company_id = p.company_id
      where ph.id = project_tasks.phase_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('owner_admin', 'project_manager')
    )
  );

drop policy if exists "Managers can update project tasks" on public.project_tasks;
create policy "Managers can update project tasks"
  on public.project_tasks for update
  to authenticated
  using (
    exists (
      select 1
      from public.project_phases ph
      join public.projects p on p.id = ph.project_id
      join public.company_members m on m.company_id = p.company_id
      where ph.id = project_tasks.phase_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('owner_admin', 'project_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.project_phases ph
      join public.projects p on p.id = ph.project_id
      join public.company_members m on m.company_id = p.company_id
      where ph.id = project_tasks.phase_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('owner_admin', 'project_manager')
    )
  );

grant select, insert, update on public.project_tasks to authenticated;

create or replace function public.recalculate_phase_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_phase_id uuid;
begin
  target_phase_id := case when tg_op = 'DELETE' then old.phase_id else new.phase_id end;

  update public.project_phases
  set progress_percent = coalesce((
    select round(
      sum(progress_percent * weight) /
      nullif(sum(weight), 0)
    )::integer
    from public.project_tasks
    where phase_id = target_phase_id
  ), 0)
  where id = target_phase_id;

  return null;
end;
$$;

drop trigger if exists project_task_progress_changed on public.project_tasks;
create trigger project_task_progress_changed
after insert or update or delete on public.project_tasks
for each row execute function public.recalculate_phase_progress();
