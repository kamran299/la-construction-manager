import { getSupabaseClient } from '../services/supabase.js';
import { documentHtml } from './paperwork.js?v=20260924-phone-5';

import { createDocumentPdf } from './paperwork-pdf.js?v=20260924-phone-5';

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
      const bytes=await createDocumentPdf(d);
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      const download=document.createElement('a');download.href=url;download.download=d.document_number+'.pdf';download.textContent='Download PDF';download.id='downloadPdf';
      button.replaceWith(download);
      const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener';open.textContent='Open PDF to print';open.style.marginLeft='20px';download.after(open);
      status.textContent='Your PDF is ready. Download it, or open the PDF to print.';
      window.addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});
    } catch(error) {status.textContent='PDF could not be prepared: '+error.message;button.textContent='PDF unavailable';}
  } catch(error) {
    document.getElementById('printStatus').textContent='Document could not be opened.';
    const output=document.getElementById('printError');output.hidden=false;output.textContent=error.message;
  }
}
start();
