-- Opt-in GPS time clock. Additive only: existing labor entries are unchanged.
-- Location is captured only when an employee presses Check in or Check out.

create table if not exists public.time_clock_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  member_id uuid not null references auth.users(id) on delete restrict,
  employee_name text not null check (char_length(trim(employee_name)) > 0),
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  check_in_latitude double precision not null check (check_in_latitude between -90 and 90),
  check_in_longitude double precision not null check (check_in_longitude between -180 and 180),
  check_in_accuracy_m double precision check (check_in_accuracy_m >= 0),
  check_out_latitude double precision check (check_out_latitude between -90 and 90),
  check_out_longitude double precision check (check_out_longitude between -180 and 180),
  check_out_accuracy_m double precision check (check_out_accuracy_m >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at)
);

create unique index if not exists time_clock_one_open_entry_idx
  on public.time_clock_entries(company_id, member_id)
  where check_out_at is null;
create index if not exists time_clock_company_check_in_idx
  on public.time_clock_entries(company_id, check_in_at desc);

drop trigger if exists time_clock_entries_updated_at on public.time_clock_entries;
create trigger time_clock_entries_updated_at before update on public.time_clock_entries
for each row execute function public.touch_operations_updated_at();

alter table public.time_clock_entries enable row level security;
drop policy if exists "Employees can view own time clock" on public.time_clock_entries;
create policy "Employees can view own time clock" on public.time_clock_entries for select to authenticated
using (member_id = auth.uid() and public.is_active_company_member(company_id));
drop policy if exists "Managers can view company time clock" on public.time_clock_entries;
create policy "Managers can view company time clock" on public.time_clock_entries for select to authenticated
using (public.is_company_manager(company_id));

create or replace function public.gps_clock_in(
  p_company_id uuid,
  p_project_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns public.time_clock_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  membership public.company_members%rowtype;
  new_entry public.time_clock_entries;
begin
  select * into membership from public.company_members
  where company_id = p_company_id and user_id = auth.uid() and is_active = true;
  if membership.id is null then raise exception 'Active company membership is required'; end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects where id = p_project_id and company_id = p_company_id
  ) then raise exception 'Project does not belong to this company'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid GPS location';
  end if;
  if exists (
    select 1 from public.time_clock_entries
    where company_id = p_company_id and member_id = auth.uid() and check_out_at is null
  ) then raise exception 'You are already checked in'; end if;

  insert into public.time_clock_entries (
    company_id, project_id, member_id, employee_name,
    check_in_latitude, check_in_longitude, check_in_accuracy_m
  ) values (
    p_company_id, p_project_id, auth.uid(),
    coalesce(nullif(membership.full_name, ''), nullif(membership.email, ''), 'Employee'),
    p_latitude, p_longitude, greatest(coalesce(p_accuracy_m, 0), 0)
  ) returning * into new_entry;
  return new_entry;
end;
$$;

create or replace function public.gps_clock_out(
  p_entry_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns public.time_clock_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  finished_entry public.time_clock_entries;
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid GPS location';
  end if;
  update public.time_clock_entries
  set check_out_at = now(),
      check_out_latitude = p_latitude,
      check_out_longitude = p_longitude,
      check_out_accuracy_m = greatest(coalesce(p_accuracy_m, 0), 0)
  where id = p_entry_id and member_id = auth.uid() and check_out_at is null
  returning * into finished_entry;
  if finished_entry.id is null then raise exception 'Open check-in was not found'; end if;
  return finished_entry;
end;
$$;

revoke all on function public.gps_clock_in(uuid, uuid, double precision, double precision, double precision) from public;
revoke all on function public.gps_clock_out(uuid, double precision, double precision, double precision) from public;
grant execute on function public.gps_clock_in(uuid, uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.gps_clock_out(uuid, double precision, double precision, double precision) to authenticated;
grant select on public.time_clock_entries to authenticated;
