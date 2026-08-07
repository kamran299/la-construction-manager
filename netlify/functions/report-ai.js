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

const CONSTRUCTION_GLOSSARY = `
Apply this L&A Custom Homes glossary exactly:
Poly (پُلی/پلی) is a person's name, never plate compactor. Subfloor (ساب فلور/ساب‌فلور) means subfloor, never scaffolding. تراک کانکریت means a truckload of concrete.
Standard terms include excavation, grading, compaction, trench, backfill, layout, survey, footing, foundation, formwork/forms, rebar, anchor bolt, slab, stem wall, retaining wall, waterproofing, drainage, concrete pump, framing, joist, beam, header, shear wall, sheathing, blocking, truss, roofing, rough-in, MEP, plumbing, electrical, HVAC, ductwork, fire sprinkler, low voltage, insulation, drywall/sheetrock, taping, texture, stucco, siding, flashing, scaffolding, windows, doors, cabinets, countertops, tile, hardwood, flooring, baseboard, trim, painting, finish carpentry, inspection, correction notice, punch list, change order, RFI, submittal, material delivery, subcontractor/sub, superintendent, foreman and crew.
Persian speakers frequently pronounce these as English loanwords; translate them to the matching standard English construction term. Preserve all people, company and project names, addresses, dates, times, measurements and quantities exactly. If an unfamiliar word may be a name or specialized term, transliterate it instead of inventing or substituting an unrelated item.`;

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
    ? `Create a professional English daily construction management analysis from the submitted field reports. ${CONSTRUCTION_GLOSSARY}
Never invent facts, assumptions, safety events, delays, or tomorrow tasks. Preserve exact names, project names, quantities, times, dates, and construction terms. Merge duplicate facts only when they clearly describe the same work. If reports conflict, keep both facts and identify their reporters.
Return only valid JSON with exactly this structure:
{
  "executive_summary": "A concise overall conclusion for the day.",
  "completed_work": [{"project":"Project name","details":"Work completed","reported_by":["Person name"]}],
  "blockers_and_delays": [{"project":"Project name","details":"Issue or delay","reported_by":["Person name"]}],
  "safety": [{"project":"Project name","details":"Safety observation","reported_by":["Person name"]}],
  "tomorrow_plan": [{"project":"Project name","details":"Explicitly stated next work","reported_by":["Person name"]}],
  "contributors": [{"name":"Person name","projects":["Project name"]}]
}
Use empty arrays when a category was not mentioned. Every material item must identify who reported it.`
    : `Detect whether the construction field report is Persian or English. If Persian, translate it into clear professional English. If already English, preserve its meaning and lightly clean grammar only. ${CONSTRUCTION_GLOSSARY} Never invent facts. Return only valid JSON with keys english_text and english_summary. english_summary must be one concise sentence.`;
  const input = isSummary ? JSON.stringify(body.reports || []) : String(body.text || "");
  if (!input.trim()) return json(400, { error: "Report text is required" });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${openaiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: Netlify.env.get("OPENAI_MODEL") || "gpt-4.1-mini", instructions, input }),
  });
  if (!response.ok) return json(502, { error: "Translation service is temporarily unavailable" });
  const text = outputText(await response.json()).trim();
  if (isSummary) {
    try {
      const dailySummary = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
      return json(200, { daily_summary: dailySummary, english_summary: JSON.stringify(dailySummary) });
    } catch {
      return json(502, { error: "The daily analysis could not be structured. Please try again." });
    }
  }
  try {
    return json(200, JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")));
  } catch {
    return json(200, { english_text: text, english_summary: text.split(/[.!?]/)[0] });
  }
};
