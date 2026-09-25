import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE);
const db=new PGlite();const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const [owner,worker,other,pm,outsider,c1,c2,rid]=[1,2,3,4,5,10,11,20].map(id);
await db.exec(`create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
create table companies(id uuid primary key);create table company_members(company_id uuid,user_id uuid,role text,is_active boolean);
create function is_active_company_member(c uuid) returns boolean language sql security definer as $$select exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and is_active)$$;
create table daily_reports(id uuid primary key,company_id uuid references companies,reporter_id uuid references auth.users,original_text text,english_text text,english_summary text,project_id uuid,report_date date);
alter table daily_reports enable row level security;grant select,update on daily_reports to authenticated;
create policy report_read on daily_reports for select to authenticated using(is_active_company_member(company_id));`);
for(const u of [owner,worker,other,pm,outsider])await db.query('insert into auth.users values($1)',[u]);
for(const c of [c1,c2])await db.query('insert into companies values($1)',[c]);
for(const [u,c,role] of [[owner,c1,'owner_admin'],[worker,c1,'foreman_employee'],[other,c1,'foreman_employee'],[pm,c1,'project_manager'],[outsider,c2,'owner_admin']])await db.query('insert into company_members values($1,$2,$3,true)',[c,u,role]);
await db.query("insert into daily_reports values($1,$2,$3,'old','old english','{}',null,'2026-09-25')",[rid,c1,worker]);
await db.exec(await fs.readFile('supabase/migrations/021_report_edit_permissions.sql','utf8'));
async function as(u){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated');}
const edit="select edit_team_report($1,$2,'corrected','corrected english','{}','old','old english','{}')";
for(const u of [worker,other,pm,outsider]){await as(u);await assert.rejects(db.query(edit,[rid,c1]));}
await as(owner);await db.query(edit,[rid,c1]);await assert.rejects(db.query(edit,[rid,c1]));
let history=(await db.query('select * from report_edit_history')).rows;assert.equal(history.length,1);assert.equal(history[0].edited_by,owner);assert.equal(history[0].previous_report.original_text,'old');assert.equal(history[0].revised_report.reporter_id,worker);assert.equal(history[0].revised_report.report_date,'2026-09-25');
await as(other);assert.equal((await db.query('select * from report_edit_history')).rows.length,0);assert.equal((await db.query("update daily_reports set original_text='unauthorized' where id=$1 returning id",[rid])).rows.length,0);
await as(worker);await db.query("update daily_reports set original_text='worker correction' where id=$1",[rid]);assert.equal((await db.query('select * from report_edit_history')).rows.length,2);
await assert.rejects(db.query('update daily_reports set company_id=$1 where id=$2',[c2,rid]));
await db.exec('reset role');await db.query('update company_members set is_active=false where user_id=$1',[worker]);await as(worker);assert.equal((await db.query("update daily_reports set original_text='inactive' where id=$1 returning id",[rid])).rows.length,0);
await db.close();console.log('Database checks passed: owner edits team, employees own only, PM/other-company denied, history preserved, stale edits rejected, inactive members blocked.');
