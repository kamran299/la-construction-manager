begin;
create table if not exists public.report_edit_history (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.daily_reports(id) on delete cascade,
 company_id uuid not null references public.companies(id),
 reporter_id uuid not null references auth.users(id),
 edited_by uuid not null references auth.users(id),
 edited_at timestamptz not null default now(),
 previous_report jsonb not null,
 revised_report jsonb not null
);
alter table public.report_edit_history enable row level security;
revoke all on public.report_edit_history from anon, authenticated;
grant select on public.report_edit_history to authenticated;
create or replace function public.is_report_owner_admin(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_members where company_id=p_company and user_id=auth.uid() and is_active and role='owner_admin');
$$;
revoke all on function public.is_report_owner_admin(uuid) from public;
grant execute on function public.is_report_owner_admin(uuid) to authenticated;
drop policy if exists "Report authors and owner can read revisions" on public.report_edit_history;
create policy "Report authors and owner can read revisions" on public.report_edit_history for select to authenticated
 using(public.is_active_company_member(company_id) and (reporter_id=auth.uid() or public.is_report_owner_admin(company_id)));
create or replace function public.audit_report_edit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.company_id is distinct from old.company_id or new.reporter_id is distinct from old.reporter_id then
  raise exception 'Report company and author cannot be changed';
 end if;
 if auth.uid() is not null then
  if not public.is_active_company_member(old.company_id) or not (old.reporter_id=auth.uid() or public.is_report_owner_admin(old.company_id)) then
   raise exception 'You may only edit your own reports';
  end if;
  if to_jsonb(old) is distinct from to_jsonb(new) then
   insert into public.report_edit_history(report_id,company_id,reporter_id,edited_by,previous_report,revised_report)
   values(old.id,old.company_id,old.reporter_id,auth.uid(),to_jsonb(old),to_jsonb(new));
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.audit_report_edit() from public;
drop trigger if exists audit_report_edit on public.daily_reports;
create trigger audit_report_edit before update on public.daily_reports for each row execute function public.audit_report_edit();
drop policy if exists "Members can update own reports" on public.daily_reports;
create policy "Members can update own reports" on public.daily_reports for update to authenticated
 using(reporter_id=auth.uid() and public.is_active_company_member(company_id))
 with check(reporter_id=auth.uid() and public.is_active_company_member(company_id));
create or replace function public.edit_team_report(
 p_id uuid,p_company uuid,p_original text,p_english text,p_summary text,
 p_expected_original text,p_expected_english text,p_expected_summary text
) returns public.daily_reports language plpgsql security definer set search_path='' as $$
declare r public.daily_reports;
begin
 if not public.is_report_owner_admin(p_company) then raise exception 'Only the owner can edit team reports'; end if;
 select * into r from public.daily_reports where id=p_id and company_id=p_company for update;
 if not found then raise exception 'Report unavailable'; end if;
 if r.original_text is distinct from p_expected_original or r.english_text is distinct from p_expected_english or r.english_summary is distinct from p_expected_summary then
  raise exception 'Report changed. Refresh and reopen the latest report';
 end if;
 if coalesce(length(trim(p_original)),0) not between 1 and 30000 or coalesce(length(trim(p_english)),0) not between 1 and 60000 or coalesce(length(trim(p_summary)),0) not between 1 and 100000 then
  raise exception 'Invalid report text';
 end if;
 perform p_summary::jsonb;
 update public.daily_reports set original_text=trim(p_original),english_text=p_english,english_summary=p_summary where id=r.id returning * into r;
 return r;
end;$$;
revoke all on function public.edit_team_report(uuid,uuid,text,text,text,text,text,text) from public;
grant execute on function public.edit_team_report(uuid,uuid,text,text,text,text,text,text) to authenticated;
commit;
