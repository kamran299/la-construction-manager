-- Match GPS time-clock actions to a configured project jobsite.
-- Additive only: existing projects and time-clock entries remain unchanged.

alter table public.projects
  add column if not exists latitude double precision check (latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude between -180 and 180),
  add column if not exists geofence_radius_m integer not null default 250 check (geofence_radius_m between 50 and 2000);

alter table public.time_clock_entries
  add column if not exists check_in_distance_m double precision check (check_in_distance_m >= 0),
  add column if not exists check_out_distance_m double precision check (check_out_distance_m >= 0);

create or replace function public.gps_distance_m(
  p_latitude_1 double precision,
  p_longitude_1 double precision,
  p_latitude_2 double precision,
  p_longitude_2 double precision
)
returns double precision
language sql
immutable
strict
set search_path = public
as $$
  select 6371000 * 2 * asin(sqrt(least(1::double precision,
    power(sin(radians(p_latitude_2 - p_latitude_1) / 2), 2)
    + cos(radians(p_latitude_1)) * cos(radians(p_latitude_2))
    * power(sin(radians(p_longitude_2 - p_longitude_1) / 2), 2)
  )));
$$;

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
  matched_project_id uuid;
  matched_distance_m double precision;
  new_entry public.time_clock_entries;
begin
  select * into membership from public.company_members
  where company_id = p_company_id and user_id = auth.uid() and is_active = true;
  if membership.id is null then raise exception 'Active company membership is required'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid GPS location';
  end if;
  if exists (
    select 1 from public.time_clock_entries
    where company_id = p_company_id and member_id = auth.uid() and check_out_at is null
  ) then raise exception 'You are already checked in'; end if;

  select project.id,
         public.gps_distance_m(p_latitude, p_longitude, project.latitude, project.longitude)
  into matched_project_id, matched_distance_m
  from public.projects project
  where project.company_id = p_company_id
    and project.latitude is not null
    and project.longitude is not null
    and public.gps_distance_m(p_latitude, p_longitude, project.latitude, project.longitude) <= project.geofence_radius_m
  order by public.gps_distance_m(p_latitude, p_longitude, project.latitude, project.longitude)
  limit 1;

  if matched_project_id is null then
    raise exception 'You are not inside a configured project area';
  end if;

  insert into public.time_clock_entries (
    company_id, project_id, member_id, employee_name,
    check_in_latitude, check_in_longitude, check_in_accuracy_m, check_in_distance_m
  ) values (
    p_company_id, matched_project_id, auth.uid(),
    coalesce(nullif(membership.full_name, ''), nullif(membership.email, ''), 'Employee'),
    p_latitude, p_longitude, greatest(coalesce(p_accuracy_m, 0), 0), matched_distance_m
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
  open_entry public.time_clock_entries%rowtype;
  project_latitude double precision;
  project_longitude double precision;
  project_radius_m integer;
  checkout_distance_m double precision;
  finished_entry public.time_clock_entries;
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid GPS location';
  end if;

  select * into open_entry from public.time_clock_entries
  where id = p_entry_id and member_id = auth.uid() and check_out_at is null
  for update;
  if open_entry.id is null then raise exception 'Open check-in was not found'; end if;

  select latitude, longitude, geofence_radius_m
  into project_latitude, project_longitude, project_radius_m
  from public.projects
  where id = open_entry.project_id and company_id = open_entry.company_id;
  if project_latitude is null or project_longitude is null then
    raise exception 'The checked-in project GPS area is not configured';
  end if;

  checkout_distance_m := public.gps_distance_m(p_latitude, p_longitude, project_latitude, project_longitude);
  if checkout_distance_m > project_radius_m then
    raise exception 'Check out must be completed inside the same project area';
  end if;

  update public.time_clock_entries
  set check_out_at = now(),
      check_out_latitude = p_latitude,
      check_out_longitude = p_longitude,
      check_out_accuracy_m = greatest(coalesce(p_accuracy_m, 0), 0),
      check_out_distance_m = checkout_distance_m
  where id = open_entry.id
  returning * into finished_entry;
  return finished_entry;
end;
$$;

revoke all on function public.gps_distance_m(double precision, double precision, double precision, double precision) from public;
grant execute on function public.gps_distance_m(double precision, double precision, double precision, double precision) to authenticated;

