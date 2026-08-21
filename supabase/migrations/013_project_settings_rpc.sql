-- Save project settings through one permission-checked server operation.
-- This avoids silent zero-row updates when PostgREST applies project RLS.

create or replace function public.update_project_settings(
  p_project_id uuid,
  p_name text,
  p_address text,
  p_project_type text,
  p_latitude double precision,
  p_longitude double precision,
  p_geofence_radius_m integer
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  saved_project public.projects;
begin
  select company_id into target_company_id
  from public.projects
  where id = p_project_id;

  if target_company_id is null then raise exception 'Project was not found'; end if;
  if not public.is_company_manager(target_company_id) then
    raise exception 'Owner or Project Manager access is required';
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'Project name is required'; end if;
  if p_latitude is not null and not p_latitude between -90 and 90 then raise exception 'Invalid project latitude'; end if;
  if p_longitude is not null and not p_longitude between -180 and 180 then raise exception 'Invalid project longitude'; end if;
  if p_geofence_radius_m not between 50 and 2000 then raise exception 'Project GPS radius must be between 50 and 2000 meters'; end if;

  update public.projects
  set name = trim(p_name),
      address = nullif(trim(coalesce(p_address, '')), ''),
      project_type = p_project_type,
      latitude = p_latitude,
      longitude = p_longitude,
      geofence_radius_m = p_geofence_radius_m
  where id = p_project_id
  returning * into saved_project;

  return saved_project;
end;
$$;

revoke all on function public.update_project_settings(uuid, text, text, text, double precision, double precision, integer) from public;
grant execute on function public.update_project_settings(uuid, text, text, text, double precision, double precision, integer) to authenticated;

