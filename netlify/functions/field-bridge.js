import config from './supabase-config.js';
import reportAI from './report-ai.js';
import transcribe from './field-report-transcribe.js';
import agents from './field-ops-agent.js';
import invite from './field-contractor-invite.js';
import teamInvite from './team-invite.js';
import teamManage from './team-member-manage.js';
import workerInvite from './worker-invite.js';
const ORIGIN='https://la-contractor-operations.k-aslanpour.chatgpt.site';
const routes={'supabase-config':config,'report-ai':reportAI,'report-transcribe':transcribe,'ops-agent':agents,'contractor-invite':invite,'team-invite':teamInvite,'team-member-manage':teamManage,'worker-invite':workerInvite};
export default async function handler(request){
 const origin=request.headers.get('origin');
 if(origin && origin!==ORIGIN)return new Response('Origin not allowed',{status:403});
 const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Vary':'Origin','Cache-Control':'no-store'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const route=new URL(request.url).searchParams.get('route');
 if(!Object.hasOwn(routes,route))return new Response('Not found',{status:404,headers});
 if(route!=='supabase-config'&&!/^Bearer .+/.test(request.headers.get('authorization')||''))return new Response('Sign in required',{status:401,headers});
 if(request.method!==(route==='supabase-config'?'GET':'POST'))return new Response('Method not allowed',{status:405,headers});
 try{const result=await routes[route](request);const response=new Response(result.body,{status:result.status,headers:result.headers});for(const [k,v]of Object.entries(headers))response.headers.set(k,v);return response;}
 catch{return new Response(JSON.stringify({error:'The service could not complete this request.'}),{status:502,headers:{...headers,'Content-Type':'application/json'}});}
}
