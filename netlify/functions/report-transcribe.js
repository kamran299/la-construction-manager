function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

async function verifyUser(token, supabaseUrl, publicKey) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publicKey, authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : null;
}

async function transcribe(openaiKey, audio, model) {
  const body = new FormData();
  body.append("file", audio, audio.name || "persian-report.webm");
  body.append("model", model);
  body.append("prompt", "A Persian or English daily construction field report containing project names, addresses, trade work, materials, safety notes, delays, and next steps. Company vocabulary: Poly (پُلی/پلی) is a person's name and must be written as Poly; subfloor (ساب فلور/ساب‌فلور) is the construction term subfloor and must never be changed to scaffolding; تراک کانکریت means a truckload of concrete. Preserve names, quantities, times, and construction terminology accurately.");
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${openaiKey}` },
    body,
  });
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const publicKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const openaiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!token || !supabaseUrl || !publicKey || !openaiKey) return json(401, { error: "Service is not configured" });
  if (!(await verifyUser(token, supabaseUrl, publicKey))) return json(401, { error: "Invalid session" });

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!audio || typeof audio.arrayBuffer !== "function" || !audio.size) return json(400, { error: "A voice recording is required" });
    if (audio.size > 4 * 1024 * 1024) return json(413, { error: "The recording is too long. Please record a shorter report." });

    const configuredModel = Netlify.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";
    let response = await transcribe(openaiKey, audio, configuredModel);
    if (!response.ok && configuredModel !== "whisper-1") response = await transcribe(openaiKey, audio, "whisper-1");
    if (!response.ok) return json(502, { error: "Voice transcription is temporarily unavailable" });
    const data = await response.json();
    return json(200, { text: String(data.text || "").trim() });
  } catch {
    return json(400, { error: "The voice recording could not be processed" });
  }
};
