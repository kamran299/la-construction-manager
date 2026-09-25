begin;
alter table public.paperwork_documents drop constraint if exists paperwork_documents_kind_check;
alter table public.paperwork_documents add constraint paperwork_documents_kind_check check(kind in ('estimate','invoice','proposal','change_order'));
alter table public.paperwork_documents drop constraint if exists paperwork_documents_amount_check;
alter table public.paperwork_documents add constraint paperwork_documents_amount_check check(amount > 0 or kind='change_order');
create or replace function public.save_paperwork(
 p_id uuid, p_company_id uuid, p_project_id uuid, p_kind text, p_issue_date date,
 p_client_name text, p_project_address text, p_title text, p_scope text,
 p_amount numeric, p_notes text, p_expected_version integer default 0
) returns public.paperwork_documents
language plpgsql security definer set search_path = '' as $$
declare existing public.paperwork_documents; result public.paperwork_documents;
 n integer; year_value integer; prefix text;
begin
 if not public.can_access_paperwork(p_company_id) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_expected_version is null or p_expected_version < 0 then raise exception 'Expected version is required'; end if;
 if p_id is null or p_issue_date is null or p_kind not in ('estimate','invoice','proposal','change_order') or p_kind is null then
   raise exception 'Document ID, type and date are required'; end if;
 if p_amount is null or (p_kind != 'change_order' and p_amount <= 0) or abs(p_amount) >= 1000000000000 or p_amount != round(p_amount,2) then
   raise exception 'Enter a valid amount with no more than two decimals; only change orders allow zero or credits'; end if;
 if p_project_id is not null and not exists(select 1 from public.projects where id=p_project_id and company_id=p_company_id) then
   raise exception 'Project does not belong to this company'; end if;
 -- Serialize requests for the same document, including retrying a lost response.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.paperwork_documents where id=p_id for update;
 if found then
   if existing.company_id != p_company_id then raise exception 'Access denied' using errcode='42501'; end if;
   if p_expected_version=0 then return existing; end if;
   if existing.version != p_expected_version then raise exception 'Document changed. Reload before editing.'; end if;
   if existing.status != 'draft' then raise exception 'Only drafts can be edited'; end if;
   if existing.kind != p_kind then raise exception 'Document type cannot change after numbering'; end if;
   update public.paperwork_documents set project_id=p_project_id,issue_date=p_issue_date,
     client_name=trim(p_client_name),project_address=trim(p_project_address),title=trim(p_title),
     scope=trim(p_scope),amount=p_amount,notes=coalesce(p_notes,''),version=version+1,updated_at=now()
     where id=p_id returning * into result;
 else
   if p_expected_version != 0 then raise exception 'Document not found'; end if;
   year_value=extract(year from p_issue_date)::integer;
   insert into public.paperwork_counters values(p_company_id,p_kind,year_value,1)
     on conflict(company_id,kind,document_year) do update set last_value=public.paperwork_counters.last_value+1
     returning last_value into n;
   prefix=case p_kind when 'invoice' then 'INV' when 'estimate' then 'EST' when 'change_order' then 'CO' else 'PRO' end;
   insert into public.paperwork_documents(id,company_id,created_by,project_id,kind,document_number,
     issue_date,client_name,project_address,title,scope,amount,notes)
   values(p_id,p_company_id,auth.uid(),p_project_id,p_kind,
     'LA-'||prefix||'-'||year_value||'-'||lpad(n::text,greatest(4,length(n::text)),'0'),
     p_issue_date,trim(p_client_name),trim(p_project_address),trim(p_title),trim(p_scope),p_amount,coalesce(p_notes,''))
     returning * into result;
 end if;
 return result;
end $$;
revoke all on function public.save_paperwork(uuid,uuid,uuid,text,date,text,text,text,text,numeric,text,integer) from public;
grant execute on function public.save_paperwork(uuid,uuid,uuid,text,date,text,text,text,text,numeric,text,integer) to authenticated;


commit;
