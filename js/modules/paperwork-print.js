import { getSupabaseClient } from '../services/supabase.js';
import { documentHtml } from './paperwork.js?v=20260924-print-3';

async function start() {
  try {
    const id=new URLSearchParams(location.search).get('id');
    if(!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('This document link is invalid. Open the document again from Paperwork.');
    const supabase=await getSupabaseClient();
    const {data:session,error:sessionError}=await supabase.auth.getSession();
    if(sessionError) throw sessionError;
    if(!session.session) throw new Error('Please sign in to L&A, then open this document again from Paperwork.');
    const {data:d,error}=await supabase.from('paperwork_documents').select('*').eq('id',id).maybeSingle();
    if(error) throw error;
    if(!d) throw new Error('This document is unavailable or your account does not have access.');
    const parsed=new DOMParser().parseFromString(documentHtml(d,new URL('/assets/la-original-logo.png',location.origin).href),'text/html');
    document.title=d.document_number;
    document.head.append(parsed.querySelector('style'));
    document.body.replaceChildren(...parsed.body.childNodes);
    const button=document.getElementById('printDocument');
    button.disabled=true;button.textContent='Preparing print…';
    const back=document.createElement('a');back.href='/login#paperwork';back.textContent='Back to Paperwork';back.style.marginLeft='20px';button.parentElement.append(back);
    const status=document.createElement('p');status.setAttribute('role','status');button.parentElement.append(status);
    try {
      const logo=document.querySelector('header img');
      if(logo.decode) await logo.decode();
      else if(!logo.complete) await new Promise((resolve,reject)=>{logo.onload=resolve;logo.onerror=()=>reject(new Error('Letterhead image could not load'));});
      if(!logo.naturalWidth) throw new Error('Letterhead image could not load');
      if(document.fonts?.ready) await document.fonts.ready;
      // Content stays in this real page; Safari prints after resources are ready.
      button.textContent='Print / Save as PDF';button.disabled=false;
      button.onclick=()=>window.print();
    } catch(error) {status.textContent='The letterhead could not load. Refresh this page before printing.';button.textContent='Print unavailable';}
  } catch(error) {
    document.getElementById('printStatus').textContent='Document could not be opened.';
    const output=document.getElementById('printError');output.hidden=false;output.textContent=error.message;
  }
}
start();
