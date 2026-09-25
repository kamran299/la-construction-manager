import { formatPhone, bindPhoneInput } from './phone-format.js';
const labels = { estimate: 'Estimate', invoice: 'Invoice', proposal: 'Proposal', change_order: 'Change order' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function amountInCents(value, allowAdjustment = false) {
  const text = String(value).trim();
  if (!(allowAdjustment ? /^-?\d{1,12}(\.\d{1,2})?$/ : /^\d{1,12}(\.\d{1,2})?$/).test(text)) throw new Error('Enter a positive amount with up to two decimal places.');
  const sign=text.startsWith('-')?-1:1;
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const cents = sign*(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(cents) || (!allowAdjustment && cents <= 0)) throw new Error('Enter a valid positive amount.');
  return cents;
}
const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(Number(value));
const localDate = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function documentHtml(d, logoUrl) {
  const e = escapeHtml;
  const date = new Date(d.issue_date+'T12:00:00').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(d.document_number)}</title><style>
  @page{size:letter;margin:0.65in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#202520;font-size:11pt;line-height:1.5;max-width:7.2in;margin:30px auto}header img{width:2.45in;height:auto}header p{font-size:9pt;margin:3px 0 22px}h1{font-size:23pt;margin:20px 0 3px}h2{font-size:14pt}dl{display:grid;grid-template-columns:120px 1fr;gap:5px;margin:15px 0 25px}dt{font-weight:bold}dd{margin:0;overflow-wrap:anywhere}.scope,.notes{white-space:pre-wrap;overflow-wrap:anywhere}.total{background:#f0f3ef;padding:16px;display:flex;justify-content:space-between;gap:20px;font-size:14pt;break-inside:avoid;margin-top:25px}.stamp{font-weight:bold;color:#a24612}.tools{margin:20px 0}button{padding:12px 20px;cursor:pointer} @media print{body{margin:0;max-width:none}.tools{display:none}h2{break-after:avoid}}
  </style></head><body><div class="tools"><button id="printDocument">Print / Save as PDF</button></div>
  <header><img src="${e(logoUrl)}" alt="L&A Custom Homes Inc."><p>License #1007023<br>Tel: (408) 387-0999</p></header>
  <h1>${e(labels[d.kind] || 'Document').toUpperCase()}</h1>${d.status === 'issued' ? '' : `<p class="stamp">${e(d.status.toUpperCase())}</p>`}
  <dl><dt>${e(labels[d.kind])} number</dt><dd>${e(d.document_number)}</dd><dt>Date</dt><dd>${e(date)}</dd><dt>${d.kind==='invoice'?'Bill to':'Prepared for'}</dt><dd>${e(d.client_name)}</dd>${d.client_email ? `<dt>Email</dt><dd>${e(d.client_email)}</dd>` : ''}${d.client_phone ? `<dt>Phone</dt><dd>${e(formatPhone(d.client_phone))}</dd>` : ''}<dt>Property</dt><dd>${e(d.project_address)}</dd></dl>
  <h2>${e(d.title)}</h2><div class="scope">${e(d.scope)}</div><div class="total"><strong>${d.kind==='change_order'?'Change order adjustment':d.kind==='invoice'?'Invoice total':'Total labor &amp; materials'}</strong><strong>${e(money(d.amount))}</strong></div>
  ${d.notes ? `<h2>Notes</h2><div class="notes">${e(d.notes)}</div>`:''}</body></html>`;
}
export function createPaperworkModule({supabase,companyId}) {
  const root=document.querySelector('#paperworkView');
  let documents=[],projects=[],editing=null,requestId=crypto.randomUUID(),busy=false,dirty=false;
  root.innerHTML=`<header class="dashboard-header"><div><p class="eyebrow">Private workspace</p><h1>Paperwork</h1><p>Estimates, invoices, proposals and change orders on your L&A letterhead.</p></div></header>
  <div class="pw-actions pw-create-types" aria-label="Create a document"><button type="button" data-new-kind="estimate">New estimate</button><button type="button" data-new-kind="invoice">New invoice</button><button type="button" data-new-kind="proposal">New proposal</button><button type="button" data-new-kind="change_order">New change order</button></div>
  <p id="pwMessage" role="status" aria-live="polite"></p>
  <div class="pw-grid"><section class="workspace-card"><h2 id="pwHeading">New document</h2>
  <form id="pwForm"><p id="pwEditType" hidden></p><label id="pwTypeLabel">Document type<select name="kind"><option value="estimate">Estimate</option><option value="invoice">Invoice</option><option value="proposal">Proposal</option><option value="change_order">Change order</option></select></label>
  <label>Project<select name="project_id"><option value="">Other / enter address</option></select></label>
  <label>Client name<input name="client_name" maxlength="300" required autocomplete="name"></label>
  <label>Client email<input name="client_email" type="email" maxlength="320" autocomplete="email"></label>
  <label>Client phone<input name="client_phone" type="tel" maxlength="80" autocomplete="tel"></label>
  <label>Property address<input name="project_address" maxlength="1000" required autocomplete="street-address"></label>
  <label>Date<input name="issue_date" type="date" required></label>
  <label>Title<input name="title" maxlength="300" required placeholder="Countertop work"></label>
  <label>Scope / description<textarea name="scope" rows="6" maxlength="30000" required></textarea></label>
  <label><span id="pwAmountLabel">Total amount (USD)</span><input name="amount" type="text" inputmode="decimal" required placeholder="30000.00"></label>
  <label>Notes / contract reference / schedule impact (optional)<textarea name="notes" rows="3" maxlength="10000"></textarea></label>
  <p id="pwNumber">A unique document number is assigned when you save.</p>
  <div class="pw-actions"><button class="primary-button" id="pwSave" type="submit">Save draft</button><button class="secondary-button" id="pwNew" type="button">New document</button></div>
  </form></section><section class="workspace-card"><h2>Saved documents</h2><label>Search<input id="pwSearch" type="search" placeholder="Number, client or address"></label><button id="pwRefresh" class="secondary-button" type="button">Refresh list</button><div id="pwList"></div></section></div>`;
  const form=root.querySelector('#pwForm'), list=root.querySelector('#pwList');
  const field=name=>form.elements.namedItem(name);
  bindPhoneInput(field('client_phone'));
  function message(text,error=false){const el=root.querySelector('#pwMessage');el.textContent=text;el.className=error?'message message-error':'message';}
  function lock(value){busy=value;root.querySelectorAll('button').forEach(b=>b.disabled=value);form.querySelectorAll('input,textarea,select').forEach(el=>el.disabled=value);if(!value)field('kind').disabled=Boolean(editing);}
  function updateAmountLabel(){root.querySelector('#pwAmountLabel').textContent=field('kind').value==='change_order'?'Change amount (USD): positive addition, negative credit, or 0':'Total amount (USD)';}
  field('kind').addEventListener('change',updateAmountLabel);
  function reset(kind='estimate'){editing=null;requestId=crypto.randomUUID();form.reset();field('kind').value=kind;field('kind').disabled=false;root.querySelector('#pwTypeLabel').hidden=false;root.querySelector('#pwEditType').hidden=true;updateAmountLabel();field('issue_date').value=localDate();root.querySelector('#pwHeading').textContent='New document';root.querySelector('#pwNumber').textContent='A unique document number is assigned when you save.';dirty=false;}
  function renderList(){const q=root.querySelector('#pwSearch').value.toLowerCase();const matches=documents.filter(d=>[d.document_number,d.client_name,d.project_address,d.title].join(' ').toLowerCase().includes(q));
    list.innerHTML=matches.length?matches.map(d=>`<article class="pw-document"><strong>${escapeHtml(d.document_number)}</strong><span class="pw-status">${escapeHtml(d.status)}</span><p>${escapeHtml(d.client_name)}<br>${escapeHtml(d.project_address)}</p><p>${escapeHtml(d.title)} · ${escapeHtml(money(d.amount))}<br>${escapeHtml(d.issue_date)}</p><div class="pw-actions">${d.status==='draft'?`<button data-action="edit" data-id="${escapeHtml(d.id)}">Edit</button><button data-action="issue" data-id="${escapeHtml(d.id)}">Mark issued</button>`:''}<a class="pw-print-link" href="/paperwork-print.html?id=${encodeURIComponent(d.id)}" target="_blank" rel="noopener">Download / Print PDF</a>${d.status!=='void'?`<button data-action="void" data-id="${escapeHtml(d.id)}">Void</button>`:''}</div></article>`).join(''):'<p>No matching documents.</p>';
  }
  async function fetchDocuments(){const {data,error}=await supabase.from('paperwork_documents').select('*').eq('company_id',companyId).order('created_at',{ascending:false});if(error)throw error;documents=data||[];renderList();}
  async function load(){if(busy)return;lock(true);try{
    const {data,error}=await supabase.from('projects').select('id,name,address,client_name,client_email,client_phone').eq('company_id',companyId).order('name');if(error)throw error;
    projects=data||[];const selection=field('project_id').value;
    field('project_id').innerHTML='<option value="">Other / enter address</option>'+projects.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');field('project_id').value=selection;
    await fetchDocuments();message('Only your authorized account can access these documents.');
  }catch(error){message('Could not load paperwork. '+error.message,true);}finally{lock(false);}}
  form.addEventListener('input',()=>{dirty=true;});
  field('project_id').addEventListener('change',()=>{const p=projects.find(p=>p.id===field('project_id').value);if(p){field('project_address').value=p.address||'';field('client_name').value=p.client_name||'';field('client_email').value=p.client_email||'';field('client_phone').value=formatPhone(p.client_phone);}else{for(const n of ['project_address','client_name','client_email','client_phone'])field(n).value='';}dirty=true;});
  root.querySelector('#pwSearch').oninput=renderList;
  root.querySelector('#pwRefresh').onclick=load;
  root.querySelectorAll('[data-new-kind]').forEach(button=>{button.onclick=()=>{if(!dirty||confirm('Discard unsaved changes and start a new document?'))reset(button.dataset.newKind);};});
  root.querySelector('#pwNew').onclick=()=>{if(!dirty||confirm('Discard unsaved changes and start a new document?'))reset();};
  form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;
    let cents;try{cents=amountInCents(field('amount').value,field('kind').value==='change_order');}catch(e){message(e.message,true);return;}
    lock(true);try{const {data,error}=await supabase.rpc('save_paperwork_with_client',{
      p_id:requestId,p_company_id:companyId,p_project_id:field('project_id').value||null,p_kind:field('kind').value,p_issue_date:field('issue_date').value,
      p_client_name:field('client_name').value.trim(),p_client_email:field('client_email').value.trim(),p_client_phone:formatPhone(field('client_phone').value),p_project_address:field('project_address').value.trim(),p_title:field('title').value.trim(),p_scope:field('scope').value.trim(),p_amount:(cents/100).toFixed(2),p_notes:field('notes').value,p_expected_version:editing?.version||0});
      if(error)throw error;const saved=Array.isArray(data)?data[0]:data;edit(saved);await fetchDocuments();message('Saved '+saved.document_number+'. Print the draft or mark it issued when ready.');
    }catch(error){message('Could not save: '+error.message,true);}finally{lock(false);}};
  function edit(d){editing=d;requestId=d.id;for(const name of ['kind','project_id','client_name','client_email','client_phone','project_address','issue_date','title','scope','amount','notes'])field(name).value=d[name]??'';field('client_phone').value=formatPhone(field('client_phone').value);field('kind').disabled=true;updateAmountLabel();root.querySelector('#pwTypeLabel').hidden=true;root.querySelector('#pwEditType').hidden=false;root.querySelector('#pwEditType').textContent=labels[d.kind]+' · '+d.document_number+'. Use a New document button above to create a different document.';root.querySelector('#pwHeading').textContent='Edit draft';root.querySelector('#pwNumber').textContent=d.document_number;dirty=false;}
  list.onclick=async event=>{const button=event.target.closest('button[data-action]');if(!button||busy)return;const d=documents.find(d=>d.id===button.dataset.id);if(!d)return;
    if(button.dataset.action==='edit'){if(!dirty||confirm('Discard unsaved changes?'))edit(d);return;}
    const status=button.dataset.action==='issue'?'issued':'void';
    if(dirty&&editing?.id===d.id){message('Save your edits before changing this document status.',true);return;}
    if(!confirm(status==='issued'?`Mark ${d.document_number} issued? It will become read-only. This does not send it to the client.`:`Void ${d.document_number}? The number and record will be retained.`))return;
    lock(true);try{const {error}=await supabase.rpc('set_paperwork_status',{p_id:d.id,p_status:status,p_expected_version:d.version});if(error)throw error;if(editing?.id===d.id)reset();await fetchDocuments();message(d.document_number+' marked '+status+'.');}catch(error){message(error.message,true);}finally{lock(false);}
  };
  reset();return {load};
}
