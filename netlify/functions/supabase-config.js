export default async () => {
  const url = Netlify.env.get("SUPABASE_URL");
  const key = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const googleMapsKey = Netlify.env.get("GOOGLE_MAPS_API_KEY");

  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Supabase is not configured for this environment." }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  return new Response(JSON.stringify({ url, key, googleMapsKey: googleMapsKey || null }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
