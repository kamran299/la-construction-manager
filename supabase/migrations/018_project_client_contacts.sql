begin;
alter table public.projects add column if not exists client_name text not null default '' check(length(client_name)<=300);
alter table public.projects add column if not exists client_email text not null default '' check(length(client_email)<=320 and (client_email='' or client_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));
alter table public.projects add column if not exists client_phone text not null default '' check(length(client_phone)<=80);
alter table public.paperwork_documents add column if not exists client_email text not null default '' check(length(client_email)<=320 and (client_email='' or client_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));
alter table public.paperwork_documents add column if not exists client_phone text not null default '' check(length(client_phone)<=80);

create or replace function public.update_project_with_client(
 p_project_id uuid,p_name text,p_address text,p_project_type text,
 p_latitude double precision,p_longitude double precision,p_geofence_radius_m integer,
 p_client_name text,p_client_email text,p_client_phone text
) returns public.projects language plpgsql security definer set search_path='' as $$
declare result public.projects;
begin
 -- Reuse existing manager check, address validation and GPS behavior, atomically.
 select * into result from public.update_project_settings(p_project_id,p_name,p_address,p_project_type,p_latitude,p_longitude,p_geofence_radius_m);
 update public.projects set client_name=trim(coalesce(p_client_name,'')),client_email=trim(coalesce(p_client_email,'')),client_phone=trim(coalesce(p_client_phone,''))
 where id=result.id returning * into result;
 return result;
end $$;
revoke all on function public.update_project_with_client(uuid,text,text,text,double precision,double precision,integer,text,text,text) from public;
grant execute on function public.update_project_with_client(uuid,text,text,text,double precision,double precision,integer,text,text,text) to authenticated;

create or replace function public.save_paperwork_with_client(
 p_id uuid,p_company_id uuid,p_project_id uuid,p_kind text,p_issue_date date,
 p_client_name text,p_project_address text,p_title text,p_scope text,p_amount numeric,p_notes text,
 p_client_email text,p_client_phone text,p_expected_version integer default 0
) returns public.paperwork_documents language plpgsql security definer set search_path='' as $$
declare result public.paperwork_documents; existed boolean;
begin
 if not public.can_access_paperwork(p_company_id) then raise exception 'Access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select exists(select 1 from public.paperwork_documents where id=p_id) into existed;
 -- Original save handles numbering, retry safety, version checks and issued locks.
 select * into result from public.save_paperwork(p_id,p_company_id,p_project_id,p_kind,p_issue_date,p_client_name,p_project_address,p_title,p_scope,p_amount,p_notes,p_expected_version);
 if existed and p_expected_version=0 then return result; end if;
 update public.paperwork_documents set client_email=trim(coalesce(p_client_email,'')),client_phone=trim(coalesce(p_client_phone,''))
 where id=result.id returning * into result;
 return result;
end $$;
revoke all on function public.save_paperwork_with_client(uuid,uuid,uuid,text,date,text,text,text,text,numeric,text,text,text,integer) from public;
grant execute on function public.save_paperwork_with_client(uuid,uuid,uuid,text,date,text,text,text,text,numeric,text,text,text,integer) to authenticated;
commit;
