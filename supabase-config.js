export default async () => {
  const url = Netlify.env.get("SUPABASE_URL");
  const key = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) {
    return new Response(JSON.stringify({error:"Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify environment variables."}), {
      status:503, headers:{"content-type":"application/json","cache-control":"no-store"}
    });
  }
  return new Response(JSON.stringify({url,key}), {headers:{"content-type":"application/json","cache-control":"no-store"}});
};