import test from 'node:test';
import assert from 'node:assert/strict';
import {saveReportEdit} from '../js/modules/report-editing.js';
const report={id:'r',company_id:'c',reporter_id:'u',original_text:'original',english_text:'old',english_summary:'{}'};
function setup(data={id:'r'},error=null){const calls=[];const q={update(v){calls.push(['update',v]);return q},eq(k,v){calls.push(['eq',k,v]);return q},select(){return q},async maybeSingle(){return{data,error}}};return{calls,supabase:{from(){return q}}};}
const args={report,text:' corrected ',translated:{english_text:'Corrected report',structured_report:{completed:['Corrected']}},userId:'u',companyId:'c'};
test('editing updates text and structured report while preserving identity, project, date and photos',async()=>{const x=setup();await saveReportEdit({...args,...x});assert.deepEqual(Object.keys(x.calls[0][1]).sort(),['english_summary','english_text','original_text']);assert.equal(x.calls[0][1].original_text,'corrected');for(const key of ['id','company_id','reporter_id','original_text','english_text','english_summary'])assert(x.calls.some(c=>c[0]==='eq'&&c[1]===key));});
test('cannot edit another reporter or company',async()=>{for(const change of [{userId:'other'},{companyId:'other'}]){const x=setup();await assert.rejects(saveReportEdit({...args,...x,...change}),/own reports/);assert.equal(x.calls.length,0);}});
test('stale or missing report is not reported saved',async()=>{await assert.rejects(saveReportEdit({...args,...setup(null)}),/changed/);});
test('database failure is propagated',async()=>{await assert.rejects(saveReportEdit({...args,...setup(null,new Error('denied'))}),/denied/);});
test('incomplete translation never writes',async()=>{const x=setup();await assert.rejects(saveReportEdit({...args,...x,translated:{english_text:''}}),/translation/);assert.equal(x.calls.length,0);});

test('owner uses authorized RPC for another author',async()=>{let payload;const supabase={rpc:async(name,p)=>{assert.equal(name,'edit_team_report');payload=p;return{data:{id:'r'}}}};await saveReportEdit({...args,supabase,userId:'owner',canEditAll:true});assert.equal(payload.p_expected_original,'original');assert.equal(payload.p_company,'c');});
test('missing owner RPC clearly reports activation needed',async()=>{const supabase={rpc:async()=>({error:{code:'PGRST202'}})};await assert.rejects(saveReportEdit({...args,supabase,userId:'owner',canEditAll:true}),/activation/);});
