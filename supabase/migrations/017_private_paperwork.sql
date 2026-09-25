-- Private L&A paperwork. Run as database administrator, in one transaction.
-- Access is assigned to the existing, verified Kamran account, never to a role alone.
begin;
create table if not exists public.paperwork_access (
  company_id uuid primary key references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade
);
alter table public.paperwork_access enable row level security;
revoke all on public.paperwork_access from anon, authenticated;

do $$
declare owner_id uuid; company_id_value uuid;
begin
  select id into strict owner_id from auth.users where lower(email) = 'kamran@ava-construction.com';
  select company_id into strict company_id_value from public.company_members
    where user_id=owner_id and is_active and role='owner_admin';
  insert into public.paperwork_access(company_id,user_id) values(company_id_value,owner_id)
    on conflict(company_id) do nothing;
end $$;

create or replace function public.can_access_paperwork(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.paperwork_access a
    join public.company_members m on m.company_id=a.company_id and m.user_id=a.user_id
    where a.company_id=p_company_id and a.user_id=auth.uid() and m.is_active);
$$;
revoke all on function public.can_access_paperwork(uuid) from public;
grant execute on function public.can_access_paperwork(uuid) to authenticated;

create table if not exists public.paperwork_counters (
 company_id uuid not null references public.companies(id),
 kind text not null, document_year integer not null, last_value integer not null,
 primary key(company_id,kind,document_year)
);
alter table public.paperwork_counters enable row level security;
revoke all on public.paperwork_counters from anon, authenticated;

create table if not exists public.paperwork_documents (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 created_by uuid not null references auth.users(id),
 project_id uuid references public.projects(id) on delete set null,
 kind text not null check(kind in ('estimate','invoice','proposal')),
 document_number text not null,
 issue_date date not null,
 client_name text not null check(length(trim(client_name)) between 1 and 300),
 project_address text not null check(length(trim(project_address)) between 1 and 1000),
 title text not null check(length(trim(title)) between 1 and 300),
 scope text not null check(length(trim(scope)) between 1 and 30000),
 amount numeric(14,2) not null check(amount > 0),
 notes text not null default '' check(length(notes)<=10000),
 status text not null default 'draft' check(status in ('draft','issued','void')),
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,document_number)
);
alter table public.paperwork_documents enable row level security;
revoke all on public.paperwork_documents from anon, authenticated;
grant select on public.paperwork_documents to authenticated;
drop policy if exists "Private owner paperwork" on public.paperwork_documents;
create policy "Private owner paperwork" on public.paperwork_documents for select to authenticated
 using(public.can_access_paperwork(company_id));

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
 if p_id is null or p_issue_date is null or p_kind not in ('estimate','invoice','proposal') or p_kind is null then
   raise exception 'Document ID, type and date are required'; end if;
 if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 or p_amount != round(p_amount,2) then
   raise exception 'Enter a positive amount with no more than two decimals'; end if;
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
   prefix=case p_kind when 'invoice' then 'INV' when 'estimate' then 'EST' else 'PRO' end;
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

create or replace function public.set_paperwork_status(p_id uuid,p_status text,p_expected_version integer)
returns public.paperwork_documents language plpgsql security definer set search_path='' as $$
declare d public.paperwork_documents;
begin
 select * into d from public.paperwork_documents where id=p_id for update;
 if not found or not public.can_access_paperwork(d.company_id) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_expected_version is null or d.version != p_expected_version then raise exception 'Document changed. Reload before continuing.'; end if;
 if not ((d.status='draft' and p_status in ('issued','void')) or (d.status='issued' and p_status='void')) then
   raise exception 'Invalid document status change'; end if;
 update public.paperwork_documents set status=p_status,version=version+1,updated_at=now() where id=p_id returning * into d;
 return d;
end $$;
revoke all on function public.set_paperwork_status(uuid,text,integer) from public;
grant execute on function public.set_paperwork_status(uuid,text,integer) to authenticated;
commit;
