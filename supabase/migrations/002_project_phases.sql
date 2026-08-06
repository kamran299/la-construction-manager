create table if not exists public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  sort_order integer not null default 0,
  weight numeric(8,2) not null default 1 check (weight > 0),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists project_phases_project_id_idx on public.project_phases(project_id);
alter table public.project_phases enable row level security;

drop policy if exists "Members can view project phases" on public.project_phases;
create policy "Members can view project phases" on public.project_phases for select to authenticated
using (exists (
  select 1 from public.projects p join public.company_members m on m.company_id = p.company_id
  where p.id = project_phases.project_id and m.user_id = auth.uid() and m.is_active = true
));

drop policy if exists "Managers can create projects" on public.projects;
create policy "Managers can create projects" on public.projects for insert to authenticated
with check (exists (
  select 1 from public.company_members m where m.company_id = projects.company_id
  and m.user_id = auth.uid() and m.is_active = true and m.role in ('owner_admin', 'project_manager')
));

drop policy if exists "Managers can update projects" on public.projects;
create policy "Managers can update projects" on public.projects for update to authenticated
using (exists (
  select 1 from public.company_members m where m.company_id = projects.company_id
  and m.user_id = auth.uid() and m.is_active = true and m.role in ('owner_admin', 'project_manager')
));

drop policy if exists "Managers can create project phases" on public.project_phases;
create policy "Managers can create project phases" on public.project_phases for insert to authenticated
with check (exists (
  select 1 from public.projects p join public.company_members m on m.company_id = p.company_id
  where p.id = project_phases.project_id and m.user_id = auth.uid() and m.is_active = true
  and m.role in ('owner_admin', 'project_manager')
));

drop policy if exists "Managers can update project phases" on public.project_phases;
create policy "Managers can update project phases" on public.project_phases for update to authenticated
using (exists (
  select 1 from public.projects p join public.company_members m on m.company_id = p.company_id
  where p.id = project_phases.project_id and m.user_id = auth.uid() and m.is_active = true
  and m.role in ('owner_admin', 'project_manager')
));

grant select, insert, update on public.projects, public.project_phases to authenticated;

create or replace function public.recalculate_project_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_project_id uuid;
begin
  target_project_id := coalesce(new.project_id, old.project_id);
  update public.projects
  set progress_percent = coalesce((
    select round(sum(progress_percent * weight) / nullif(sum(weight), 0))::integer
    from public.project_phases where project_id = target_project_id
  ), 0)
  where id = target_project_id;
  return coalesce(new, old);
end $$;

drop trigger if exists project_phase_progress_changed on public.project_phases;
create trigger project_phase_progress_changed after insert or update or delete
on public.project_phases for each row execute function public.recalculate_project_progress();
