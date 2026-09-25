import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const root=process.cwd();
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+req.url.split('?')[0]);if(!path.startsWith(root+'/'))throw Error();let content=await readFile(path);if(path.endsWith('login.html'))content=content.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'}[extname(path)]||'text/html'));res.end(content);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_BROWSER_PATH});
try{
const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(`http://127.0.0.1:${server.address().port}/login.html`);
await page.route('**/.netlify/functions/report-ai',r=>r.fulfill({json:{english_text:'Corrected English report',structured_report:{completed:['Corrected work']}}}));
await page.evaluate(async()=>{
 const own={id:'own',company_id:'company',reporter_id:'worker',reporter_name:'Test worker',original_text:'Original report',english_text:'Original English report',english_summary:'{}',report_photos:[],report_date:'2026-09-25'};
 window.rows=[own,{...own,id:'other',reporter_id:'another'}];window.failSave=false;
 const supabase={from(table){let patch;const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},update(v){patch=v;return q},async maybeSingle(){if(patch){if(window.failSave)return{data:null,error:null};const row=window.rows.find(r=>filters.every(([k,v])=>r[k]===v));if(row)Object.assign(row,patch);return{data:row?{id:row.id}:null,error:null}}return{data:null,error:null}},then(resolve){return Promise.resolve({data:table==='daily_reports'?window.rows:[],error:null}).then(resolve)}};return q}};
 const {createReportsModule}=await import('/js/modules/reports.js');const module=createReportsModule({supabase,session:{user:{id:'worker'},access_token:'fixture'},companyId:'company',membership:{},canManage:false});await module.load();
 let node=document.querySelector('#reportsView');while(node){node.hidden=false;node.style.display='block';node=node.parentElement;}
});
assert.equal(await page.locator('[data-edit-report]').count(),1);
await page.locator('[data-edit-report]').click();await page.locator('.report-edit-form textarea').fill('Cancel this correction');await page.locator('[data-cancel-edit]').click();assert.equal(await page.locator('.report-edit-form').count(),0);
await page.locator('[data-edit-report]').click();await page.locator('.report-edit-form textarea').fill('New corrected report');await page.locator('.report-edit-form button[type=submit]').click();await page.waitForFunction(()=>window.rows[0].original_text==='New corrected report');assert.equal(await page.locator('.report-edit-form').count(),0);assert.equal(await page.locator('.report-card').first().locator('.report-english p').first().innerText(),'Corrected English report');
await page.evaluate(()=>window.failSave=true);await page.locator('[data-edit-report]').click();await page.locator('.report-edit-form textarea').fill('Keep my correction');await page.locator('.report-edit-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-edit-message]')?.textContent.includes('changed'));assert.equal(await page.locator('.report-edit-form textarea').inputValue(),'Keep my correction');
console.log('Browser checks passed: edit visible for author only, cancel, save/reload, stale save preserves correction.');
}finally{await browser.close();server.close();}
