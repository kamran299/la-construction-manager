import { formatPhone } from './phone-format.js';
import { PDFDocument, rgb } from '../../assets/vendor/pdf-lib.esm.min.js';
import '../../assets/vendor/fontkit.umd.min.js';
const fontkit=globalThis.fontkit;
export async function createDocumentPdf(d) {
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const asset=async name=>{const r=await fetch(new URL('../../assets/'+name,import.meta.url));if(!r.ok)throw new Error('Document assets could not load. Please refresh.');return r.arrayBuffer();};
  const [regular,bold,logo]=await Promise.all([asset('vendor/LiberationSans-Regular.ttf'),asset('vendor/LiberationSans-Bold.ttf'),asset('la-original-logo.png')]);
  const font=await pdf.embedFont(regular,{subset:true}), strong=await pdf.embedFont(bold,{subset:true}), image=await pdf.embedPng(logo);
  let page,y;const margin=48,width=516;
  const newPage=()=>{page=pdf.addPage([612,792]);y=744;};newPage();
  const line=(value,size=11,isBold=false)=>{const f=isBold?strong:font;for(const paragraph of String(value??'').split('\n')){let buffer='';for(const char of paragraph){if(buffer&&f.widthOfTextAtSize(buffer+char,size)>width){draw(buffer);buffer='';}buffer+=char;}draw(buffer);}function draw(text){if(y<size+55)newPage();page.drawText(text,{x:margin,y,size,font:f,color:rgb(.12,.15,.12)});y-=size*1.45;}};
  const gap=()=>{y-=14;};
  const dimensions=image.scale(176/image.width);page.drawImage(image,{x:margin,y:y-dimensions.height,width:dimensions.width,height:dimensions.height});y-=dimensions.height+17;
  line('License #1007023 | Tel: (408) 387-0999',9);gap();
  const kind={invoice:'Invoice',estimate:'Estimate',proposal:'Proposal',change_order:'Change order'}[d.kind]||'Document';
  line(kind.toUpperCase(),23,true);if(d.status!=='issued')line(d.status.toUpperCase(),10,true);gap();
  line(`${kind} number: ${d.document_number}`,11,true);line(`Date: ${d.issue_date}`);gap();
  line(`${d.kind==='invoice'?'Bill to':'Prepared for'}: ${d.client_name}`,11,true);
  if(d.client_email)line(`Email: ${d.client_email}`);if(d.client_phone)line(`Phone: ${formatPhone(d.client_phone)}`);line(`Property: ${d.project_address}`);gap();
  line(d.title,14,true);gap();line(d.scope);gap();
  line(`${d.kind==='change_order'?'Change order adjustment':d.kind==='invoice'?'Invoice total':'Total labor & materials'}: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(d.amount))}`,14,true);
  if(d.notes){gap();line('Notes',12,true);line(d.notes);}
  pdf.getPages().forEach((p,i)=>p.drawText(`${d.document_number}  |  Page ${i+1} of ${pdf.getPageCount()}`,{x:margin,y:27,size:8,font}));
  pdf.setTitle(d.document_number);pdf.setAuthor('L&A Custom Homes Inc.');return pdf.save();
}
