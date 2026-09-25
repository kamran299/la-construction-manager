const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function normalizePhone(value){const raw=String(value||'').trim(),digits=raw.replace(/\D/g,'');if(!raw)return '';if(digits.length===10)return '+1'+digits;if(digits.length===11&&digits[0]==='1')return '+'+digits;if(/^\+[1-9][0-9]{7,14}$/.test(raw))return raw;throw Error('Enter a valid mobile phone number.');}
export default async function handler(request){
 if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
 const env=n=>globalThis.Netlify?.env.get(n)||process.env[n],url=env('SUPABASE_URL'),key=env('SUPABASE_PUBLISHABLE_KEY'),admin=env('SUPABASE_SERVICE_ROLE_KEY'),origin='https://la-contractor-operations.k-aslanpour.chatgpt.site';
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return reply(401,{error:'Sign in again.'});
 if(!url||!key||!origin)return reply(503,{error:'Invitations need site configuration.'});
 const headers={apikey:key,authorization,'Content-Type':'application/json'};
 try{
 const raw=await request.text();if(raw.length>4000)return reply(413,{error:'Request too large'});const b=JSON.parse(raw),channels=b.channels||['email'];
 if(!Array.isArray(channels)||!channels.length||channels.length>2||channels.some(c=>!['email','sms'].includes(c)))return reply(400,{error:'Choose email, SMS or both.'});
 const site=new URL(origin).origin;
 const rpc=async(name,data)=>{const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});const d=await r.json();if(!r.ok)throw Error(d.message||'Access denied');return d};
 let profile=null;
 if(b.action==='invite')profile=await rpc('invite_contractor_channels',{p_company:b.company_id,p_email:b.email||null,p_phone:normalizePhone(b.phone)||null,p_name:b.name,p_channels:channels});
 else if(['send_bid','retry_bid'].includes(b.action)){if(b.action==='send_bid')await rpc('open_bid_package',{p_id:b.package_id});}
 else return reply(400,{error:'Unknown invitation request'});
 const recipients=await rpc('pending_contractor_delivery',{p_profile:profile,p_package:profile?null:b.package_id,p_channels:channels});
 const sent={email:0,sms:0},failures=[],deadline=Date.now()+30000;
 for(const person of recipients)for(const channel of channels){
  if(!person[channel+'_pending'])continue;
  if(Date.now()>deadline){failures.push(`${channel}: still pending; retry remaining invitations.`);continue;}
  let accepted=false,detail='Not accepted';
  try{
   if(Date.now()>deadline)throw Error('Still pending; retry remaining invitations.');
   if(channel==='email'){
    if(!person.email)throw Error('No email on file.');if(!admin)throw Error('Email service configuration is missing.');
    // Invite also creates an email login for an SMS-first applicant without creating a second dossier.
    let r=await fetch(`${url}/auth/v1/invite?redirect_to=${encodeURIComponent(site+'/login.html')}`,{method:'POST',headers:{apikey:admin,authorization:`Bearer ${admin}`,'Content-Type':'application/json'},body:JSON.stringify({email:person.email}),signal:AbortSignal.timeout(8000)});
    if(!r.ok){const e=await r.json().catch(()=>({}));if(!['email_exists','user_already_exists'].includes(e.error_code||e.code))throw Error(e.message||e.msg||'Email provider rejected request.');
     r=await fetch(`${url}/auth/v1/otp?redirect_to=${encodeURIComponent(site+'/login.html')}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:person.email,create_user:false}),signal:AbortSignal.timeout(8000)});
    }
    accepted=r.ok;if(!accepted)detail='Email provider rejected request.';
   }else{
    const phone=normalizePhone(person.phone);if(!phone)throw Error('No mobile phone on file.');
    const sid=env('TWILIO_ACCOUNT_SID'),secret=env('TWILIO_AUTH_TOKEN'),service=env('TWILIO_MESSAGING_SERVICE_SID'),from=env('TWILIO_PHONE_NUMBER');
    if(!sid||!secret||(!service&&!from))throw Error('SMS service configuration is missing.');
    const purpose=profile?'Complete your subcontractor registration and upload your documents.':'You have a new project bid invitation. Review the plans and submit your bid.';
    const params=new URLSearchParams({To:phone,Body:`L&A Custom Homes: ${purpose} Open ${site}/login.html and use Text code with this phone number. Reply STOP to opt out or HELP for help.`});params.set(service?'MessagingServiceSid':'From',service||from);
    const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{authorization:`Basic ${btoa(sid+':'+secret)}`,'Content-Type':'application/x-www-form-urlencoded'},body:params.toString(),signal:AbortSignal.timeout(8000)});const d=await r.json().catch(()=>({}));accepted=r.ok&&!['failed','undelivered','canceled'].includes(d.status);if(!accepted)detail=d.message||'SMS provider rejected request.';
   }
  }catch(e){detail=e.message;}
  try{await rpc('record_contractor_delivery',{p_profile:person.profile_id,p_invitation:person.invitation_id||null,p_channel:channel,p_sent:accepted});}catch{failures.push(`${channel}: delivery status could not be recorded; check before retrying.`);}
  if(accepted)sent[channel]++;else failures.push(`${channel} · ${person.email||person.phone||person.profile_id}: ${detail}`);
 }
 return reply(200,{sent,failures,message:'Invitation requests processed. Provider acceptance does not confirm delivery.'});
 }catch(e){return reply(400,{error:e.message||'Invitation could not finish. Check status before retrying.'});}
}
