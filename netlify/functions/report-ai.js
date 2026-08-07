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

function parseModelJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
  return JSON.parse(cleaned);
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json(400, { error: "A valid JSON request is required" });
  const isSummary = body.action === "summarize";
  const instructions = isSummary
    ? `Create a professional 5 PM English construction management summary from the submitted daily field reports. ${CONSTRUCTION_GLOSSARY}
Never invent facts, assumptions, safety events, delays, or tomorrow tasks. Preserve exact names, project names, quantities, times, dates, and construction terms. Use normal name capitalization without changing the name. Merge duplicate facts only when they clearly describe the same work. Never combine unrelated tasks, inspections, deliveries, or issues into one item. If reports conflict, keep both facts and identify their reporters.
Classification rules:
- Completed work must be explicitly finished, completed, passed, delivered, or performed. Work that only started, began, is underway, is scheduled, or remains pending is not completed. Every completed_work details string may contain only completed facts; remove started or pending clauses even when they appear beside completed work in the same source sentence.
- Materials needed contains only materials explicitly needed, missing, ordered but not received, or awaiting delivery. A delivered material is not "needed" unless the report explicitly says more is required.
- Inspections contains only an actual inspection, inspector visit, inspection result, correction notice, or explicitly requested inspection. Do not turn a generic check, installation, removal, reinstallation, repair, or Monday work into an inspection.
- Overdue work requires explicit evidence that work is late, missed, overdue, unfinished past its expected time, or carried over. A general blocker is not automatically overdue.
- Risks contains only the actual risk, hazard, complaint, or concern. Describe it in natural management English. Never call enforcement, PPE use, a safety meeting, or another corrective action a "safety risk"; include a corrective action only after naming an explicit underlying hazard or noncompliance.
Return only valid JSON with exactly this structure:
{
  "executive_summary": "A concise overall conclusion for the day.",
  "completed_work": [{"project":"Project name","details":"Work completed","reported_by":["Person name"]}],
  "blockers_and_delays": [{"project":"Project name","details":"Issue or delay","reported_by":["Person name"]}],
  "tomorrow_plan": [{"project":"Project name","details":"Explicitly stated next work","reported_by":["Person name"]}],
  "labor": [{"project":"Project name","details":"Crew, trade, worker count, hours, or labor activity","reported_by":["Person name"]}],
  "inspections": [{"project":"Project name","details":"Inspection status, result, correction, or explicitly requested inspection","reported_by":["Person name"]}],
  "materials_needed": [{"project":"Project name","details":"Material explicitly needed, ordered, missing, or awaiting delivery","reported_by":["Person name"]}],
  "overdue_work": [{"project":"Project name","details":"Work explicitly reported late, missed, unfinished, or carried over","reported_by":["Person name"]}],
  "risks": [{"project":"Project name","details":"Explicit schedule, safety, quality, cost, access, weather, or coordination risk","reported_by":["Person name"]}],
  "contributors": [{"name":"Person name","projects":["Project name"]}]
}
Use empty arrays when a category was not mentioned. Every material item must identify who reported it.`
    : `Detect whether the construction field report is Persian or English. If Persian, translate it into clear professional English. If already English, preserve its meaning and lightly clean grammar only. ${CONSTRUCTION_GLOSSARY}
Never invent, infer, or fill in missing facts. A task that only started, began, is underway, scheduled, or pending is not completed. Each completed item may contain only completed facts; separate or omit any started or pending clause beside it. A delivered material is not a material need unless more is explicitly required. Only place actual inspections, inspector visits, inspection results, correction notices, or requested inspections under inspection; never turn a generic check or repair into an inspection. Keep unrelated facts as separate items. Describe risks as the underlying hazard or concern, never as PPE enforcement or another corrective action. Return only valid JSON with exactly this structure:
{
  "english_text": "Faithful cleaned English version of the complete report",
  "english_summary": "One concise sentence describing the report",
  "completed": ["Work explicitly completed or performed"],
  "blockers": ["Explicit issue, delay, dependency, or problem"],
  "next_actions": ["Explicit next step or planned work"],
  "labor": ["Crew, trade, worker count, hours, or labor activity"],
  "inspection": ["Inspection status, result, correction, or explicitly requested inspection"]
}
Use an empty array for every category not explicitly mentioned.`;
  const input = isSummary ? JSON.stringify(body.reports || []) : String(body.text || "");
  if (!input.trim()) return json(400, { error: "Report text is required" });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${openaiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: Netlify.env.get("OPENAI_MODEL") || "gpt-4.1-mini", instructions, input }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    console.error("OpenAI report processing failed", response.status, failure?.error?.message || "Unknown upstream error");
    return json(502, { error: isSummary ? "The 5 PM summary is temporarily unavailable. Please try again." : "AI report processing is temporarily unavailable. Please try again." });
  }
  const responseData = await response.json().catch(() => null);
  const text = outputText(responseData || {}).trim();
  if (!text) return json(502, { error: "The AI service returned an empty response. Please try again." });
  if (isSummary) {
    try {
      const dailySummary = parseModelJson(text);
      return json(200, { daily_summary: dailySummary, english_summary: JSON.stringify(dailySummary) });
    } catch {
      return json(502, { error: "The daily analysis could not be structured. Please try again." });
    }
  }
  try {
    const report = parseModelJson(text);
    return json(200, { ...report, structured_report: report });
  } catch {
    return json(502, { error: "The AI report could not be structured. Please try again." });
  }
};
