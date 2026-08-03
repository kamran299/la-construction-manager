-- V6 helper RPCs. Run this once in Supabase SQL Editor after the main schema.

create or replace function public.bootstrap_company(p_company_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.company_members where user_id=auth.uid() and is_active=true) then
    raise exception 'User already belongs to a company';
  end if;
  insert into public.companies(name,created_by) values(p_company_name,auth.uid()) returning id into v_company_id;
  insert into public.company_members(company_id,user_id,role) values(v_company_id,auth.uid(),'owner_admin');
  return v_company_id;
end $$;

create or replace function public.add_company_member_by_email(p_company_id uuid,p_email text,p_role public.app_role)
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare v_user_id uuid;
begin
  if public.company_role(p_company_id) <> 'owner_admin' then raise exception 'Owner access required'; end if;
  select id into v_user_id from auth.users where lower(email)=lower(p_email) limit 1;
  if v_user_id is null then raise exception 'User must create an account first'; end if;
  insert into public.company_members(company_id,user_id,role) values(p_company_id,v_user_id,p_role)
  on conflict(company_id,user_id) do update set role=excluded.role,is_active=true;
  return v_user_id;
end $$;

create or replace function public.assign_project_member_by_email(p_project_id uuid,p_email text)
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare v_user_id uuid; v_company_id uuid;
begin
  select company_id into v_company_id from public.projects where id=p_project_id;
  if not public.is_company_manager(v_company_id) then raise exception 'Manager access required'; end if;
  select id into v_user_id from auth.users where lower(email)=lower(p_email) limit 1;
  if v_user_id is null then raise exception 'User not found'; end if;
  if not exists(select 1 from public.company_members where company_id=v_company_id and user_id=v_user_id and is_active=true) then
    raise exception 'User is not a member of this company';
  end if;
  insert into public.project_members(project_id,user_id,assigned_by) values(p_project_id,v_user_id,auth.uid())
  on conflict(project_id,user_id) do nothing;
  return v_user_id;
end $$;

grant execute on function public.bootstrap_company(text) to authenticated;
grant execute on function public.add_company_member_by_email(uuid,text,public.app_role) to authenticated;
grant execute on function public.assign_project_member_by_email(uuid,text) to authenticated;
