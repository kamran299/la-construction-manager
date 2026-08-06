export default async (request) => {
  try{
    const apiKey=Netlify.env.get("OPENAI_API_KEY"); if(!apiKey)return json({error:"OPENAI_API_KEY is not configured."},503);
    const incoming=await request.formData(),audio=incoming.get("audio"),notes=String(incoming.get("notes")||""),language=String(incoming.get("language")||"fa"),project=String(incoming.get("project")||"");
    let transcript=notes;
    if(audio&&typeof audio!=="string"&&audio.size>0){
      const body=new FormData();body.append("file",audio,audio.name||"field-report.m4a");body.append("model","gpt-4o-mini-transcribe");body.append("language",language);
      const tr=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`},body});
      const tx=await tr.text();if(!tr.ok)return json({error:`Transcription failed: ${safe(tx)}`},502);transcript=[JSON.parse(tx).text,notes].filter(Boolean).join("\n");
    }
    const prompt=`You are an expert construction project coordinator. Convert this report into professional English and JSON.
Project: ${project}
Raw report: ${transcript}
Return ONLY valid JSON:
{"englishReport":"...","completed":[],"labor":[],"blockers":[],"inspection":[],"nextActions":[]}
Calculate man-hours when possible. Do not invent facts.`;
    const rr=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5-mini",input:prompt,text:{format:{type:"json_object"}}})});
    const rt=await rr.text();if(!rr.ok)return json({error:`Report generation failed: ${safe(rt)}`},502);return json(JSON.parse(extract(JSON.parse(rt))));
  }catch(e){return json({error:e?.message||"Unexpected error"},500)}
};
function extract(d){if(typeof d.output_text==="string")return d.output_text;let a=[];for(const i of d.output||[])for(const c of i.content||[])if(typeof c.text==="string")a.push(c.text);return a.join("")}
function safe(x){try{return JSON.parse(x)?.error?.message||x.slice(0,250)}catch{return x.slice(0,250)}}
function json(o,s=200){return new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}})}
