-- Managers record each worker's project, start time, and end time.
-- Existing labor and GPS records are preserved. Worker self-service clocking is paused.

alter table public.labor_entries add column if not exists worker_id uuid references public.company_workers(id) on delete set null;
alter table public.labor_entries add column if not exists start_time time;
alter table public.labor_entries add column if not exists end_time time;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.labor_entries'::regclass
      and conname = 'labor_entries_valid_time_range'
  ) then
    alter table public.labor_entries add constraint labor_entries_valid_time_range check (
      (start_time is null and end_time is null)
      or (start_time is not null and end_time is not null and end_time > start_time)
    );
  end if;
end $$;

create index if not exists labor_entries_worker_date_idx
  on public.labor_entries(company_id, worker_id, work_date desc);

-- Only owners and project managers may view or change labor records while
-- worker-managed time entry is paused.
drop policy if exists "Members can view labor_entries" on public.labor_entries;
drop policy if exists "Employees can add own labor" on public.labor_entries;
drop policy if exists "Employees can update own labor" on public.labor_entries;
drop policy if exists "Managers can view labor_entries" on public.labor_entries;
create policy "Managers can view labor_entries" on public.labor_entries for select to authenticated
using (public.is_company_manager(company_id));

-- Keep the GPS functions and their historical records available for a future
-- reactivation, but prevent employees from calling them now.
revoke execute on function public.gps_clock_in(uuid, uuid, double precision, double precision, double precision) from authenticated;
revoke execute on function public.gps_clock_out(uuid, double precision, double precision, double precision) from authenticated;
