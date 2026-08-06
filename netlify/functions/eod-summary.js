export default async (request) => {
  try{
    const apiKey=Netlify.env.get("OPENAI_API_KEY");if(!apiKey)return json({error:"OPENAI_API_KEY missing"},503);
    const body=await request.json();
    const prompt=`Create a concise construction end-of-day summary and tomorrow plan from approved reports only. Flag conflicts. Do not invent.
${JSON.stringify(body)}`;
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5-mini",input:prompt})});
    const t=await r.text();if(!r.ok)return json({error:t.slice(0,300)},502);return json({summary:extract(JSON.parse(t))});
  }catch(e){return json({error:e.message},500)}
};
function extract(d){if(typeof d.output_text==="string")return d.output_text;let a=[];for(const i of d.output||[])for(const c of i.content||[])if(typeof c.text==="string")a.push(c.text);return a.join("")}
function json(o,s=200){return new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}})}
