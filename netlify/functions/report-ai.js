function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

async function verifyUser(token, supabaseUrl, publicKey) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publicKey, authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : null;
}

function outputText(data) {
  if (data.output_text) return data.output_text;
  return (data.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n");
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const publicKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const openaiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!token || !supabaseUrl || !publicKey || !openaiKey) return json(401, { error: "Service is not configured" });
  if (!(await verifyUser(token, supabaseUrl, publicKey))) return json(401, { error: "Invalid session" });

  const body = await request.json();
  const isSummary = body.action === "summarize";
  const instructions = isSummary
    ? "Create a concise professional English end-of-day construction report. Group work by employee, preserve project names, mention blockers, safety issues, decisions, and next actions. Clearly name who submitted each item. Return only the report text."
    : "Detect whether the construction field report is Persian or English. If Persian, translate it into clear professional English. If already English, preserve its meaning and lightly clean grammar only. Apply this company glossary exactly: Poly (پُلی/پلی) is a person's name, never a plate compactor; subfloor (ساب فلور/ساب‌فلور) means subfloor and must never be changed to scaffolding; تراک کانکریت means a truckload of concrete. Preserve names, quantities, times, and construction terminology, and never invent facts. Return only valid JSON with keys english_text and english_summary. english_summary must be one concise sentence.";
  const input = isSummary ? JSON.stringify(body.reports || []) : String(body.text || "");
  if (!input.trim()) return json(400, { error: "Report text is required" });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${openaiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: Netlify.env.get("OPENAI_MODEL") || "gpt-4.1-mini", instructions, input }),
  });
  if (!response.ok) return json(502, { error: "Translation service is temporarily unavailable" });
  const text = outputText(await response.json()).trim();
  if (isSummary) return json(200, { english_summary: text });
  try {
    return json(200, JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")));
  } catch {
    return json(200, { english_text: text, english_summary: text.split(/[.!?]/)[0] });
  }
};
