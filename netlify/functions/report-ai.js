function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

const REPORT_AI_VERSION = "2026-08-10-structured-v4";

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

const INCOMPLETE_WORK = /\b(start(?:ed|ing)?|began|beginning|underway|in progress|scheduled|planned|pending|will|to be)\b/i;
const COMPLETION_EVIDENCE = /\b(completed?|finished|done|resolved|installed|delivered|passed|repaired|corrected|closed)\b/i;
const MATERIAL_ACTION = /\b(order(?:ed|ing)?|buy|purchase(?:d|ing)?|procure(?:d|ment|ing)?|source|material(?:s)?\s+(?:needed|required|missing|insufficient))\b/i;
const MATERIAL_ALREADY_AVAILABLE = /\b(delivered|received|purchased|bought|available|on[- ]?site|awaiting (?:pickup|installation)|waiting (?:for )?(?:pickup|installation))\b/i;
const LABOR_NOT_YET_PERFORMED = /\b(will|scheduled|plans? to|pending|responsible for|to (?:pick|deliver|install|start|begin|return|come|reinstall))\b/i;
const INSPECTION_EVIDENCE = /\b(inspect(?:ion|or|ed|ing)?|correction notice|sign[- ]?off)\b/i;
const EXPLICIT_RISK = /\b(noise complaint|complaint.{0,30}noise|not wearing (?:helmets?|vests?|ppe)|without (?:helmets?|vests?|ppe)|safety (?:violation|hazard|concern|issue)|unsafe|injur(?:y|ed)|accident)\b/i;
const EXPLICIT_BLOCKER = /\b(incorrect|wrong|damaged|broken|failed|missing|shortage|delay(?:ed)?|held up|cannot|can't|unable|stopped|blocked|needs? (?:repair|replacement|correction|rework|return)|requires? (?:repair|replacement|correction|rework|epoxy|new rebar))\b/i;

function inspectionKey(item) {
  const text = `${item?.details || ""} ${item?.evidence || ""}`.toLowerCase();
  const trade = /\b(soil|compaction)\b/.test(text) ? "soil-compaction" : /\b(drywall|sheetrock)\b/.test(text) ? "drywall" : /\b(duct|exhaust)\b/.test(text) ? "exhaust" : text.match(/\b(plumbing|electrical|framing|foundation|rebar|concrete|roofing|insulation|fire|hvac)\b/)?.[0] || "general";
  const status = text.match(/\b(passed|failed|conducted|completed|requested|scheduled|return|follow[- ]?up|recheck)\b/)?.[0] || "noted";
  return `${String(item?.project || "General").toLowerCase()}::${trade}::${status}`;
}

function riskKey(item) {
  const text = `${item?.details || ""} ${item?.evidence || ""}`.toLowerCase();
  const type = text.includes("noise") ? "noise" : /helmet|vest|ppe/.test(text) ? "ppe" : /injur/.test(text) ? "injury" : text.includes("accident") ? "accident" : "safety";
  return `${String(item?.project || "General").toLowerCase()}::${type}`;
}

function materialKey(value) {
  const ignored = new Set(["a", "an", "the", "to", "be", "is", "are", "was", "were", "must", "should", "for", "material", "materials", "need", "needed", "needs", "require", "required", "missing", "insufficient", "order", "ordered", "ordering", "buy", "purchase", "purchased", "purchasing", "procure", "procured", "procurement", "procuring", "source"]);
  return String(value || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => !ignored.has(word)).sort().join(" ") || "";
}

function taskKeywords(value) {
  const ignored = new Set(["a", "an", "the", "to", "be", "is", "are", "was", "were", "from", "of", "on", "at", "in", "for", "and", "or", "then", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "thirty", "material", "materials", "remove", "removed", "order", "ordered", "buy", "bought", "purchase", "purchased", "procure", "receive", "received", "start", "started", "continue", "continued", "install", "installed", "installation", "apply", "applied", "widen", "widened", "change", "changed", "complete", "completed"]);
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9]+/g)?.map((word) => word.endsWith("s") && word.length > 4 ? word.slice(0, -1) : word).filter((word) => !ignored.has(word)) || [])];
}

function sameTask(task, evidence) {
  const keywords = taskKeywords(task);
  if (!keywords.length) return false;
  const evidenceWords = new Set(taskKeywords(evidence));
  const matches = keywords.filter((word) => evidenceWords.has(word)).length;
  return matches >= Math.max(1, Math.ceil(keywords.length * 0.6));
}

function sameProject(left, right) {
  return String(left || "General").trim().toLowerCase() === String(right || "General").trim().toLowerCase();
}

function summaryItemAlreadyIncluded(items, candidate) {
  return items.some((item) => sameProject(item?.project, candidate?.project)
    && (sameTask(item?.details, candidate?.details) || sameTask(item?.evidence, candidate?.evidence)));
}

function materialNeedItems(item) {
  return String(item?.details || "").split(/;\s*|\s+and\s+(?=(?:purchased|bought|received|delivered)\b)/i).map((details) => ({ ...item, details: details.trim() })).filter((part) => {
    const details = part.details;
    if (!details) return false;
    const explicitlyPending = /\b(ordered|ordering|awaiting delivery|expected to arrive|not (?:yet )?received|backordered|must be ordered|needs? to be ordered)\b/i.test(details);
    const explicitlyAvailable = /\b(purchased|bought|received|delivered|available|on[- ]?site|payment made)\b/i.test(details);
    const moreRequired = /\b(more|additional|still)\b.{0,25}\b(needed|required|order)\b/i.test(details);
    return !explicitlyAvailable || explicitlyPending || moreRequired;
  });
}

function completedClauses(value) {
  return String(value || "")
    .split(/(?<=[.!?])\s+|;\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !INCOMPLETE_WORK.test(part));
}

function atomicSummaryItems(item) {
  const details = String(item?.details || "").trim();
  if (!INSPECTION_EVIDENCE.test(details)) return details ? [{ ...item, details }] : [];
  const materialStart = details.search(/\b(?:purchased|bought|delivered|received)\b/i);
  if (materialStart <= 0) return details ? [{ ...item, details }] : [];
  return [details.slice(0, materialStart), details.slice(materialStart)]
    .map((part) => part.trim().replace(/[;,]+$/, ""))
    .filter(Boolean)
    .map((part) => ({ ...item, details: part }));
}

function sanitizeReport(report) {
  const completed = (Array.isArray(report.completed) ? report.completed : []).flatMap(completedClauses);
  return { ...report, completed };
}

function sanitizeSummary(summary, priorTasks = [], submittedReports = []) {
  const completedWork = (Array.isArray(summary.completed_work) ? summary.completed_work : []).flatMap(atomicSummaryItems).flatMap((item) => {
    const clauses = completedClauses(item?.details);
    return clauses.length ? [{ ...item, details: clauses.join(" ") }] : [];
  });
  const inspectionMap = new Map();
  (Array.isArray(summary.inspections) ? summary.inspections : []).flatMap(atomicSummaryItems).filter((item) =>
    INSPECTION_EVIDENCE.test(String(item?.evidence || "")) && INSPECTION_EVIDENCE.test(String(item?.details || ""))
  ).forEach((item) => {
    const key = inspectionKey(item);
    const existing = inspectionMap.get(key);
    if (!existing || String(item.details || "").length > String(existing.details || "").length) inspectionMap.set(key, item);
  });
  const inspections = [...inspectionMap.values()];
  const inspectionKeys = new Set(inspections.map(inspectionKey));
  completedWork.filter((item) => INSPECTION_EVIDENCE.test(`${item?.details || ""} ${item?.evidence || ""}`)).forEach((item) => {
    const key = inspectionKey(item);
    if (!inspectionKeys.has(key)) inspections.push({ ...item });
    inspectionKeys.add(key);
  });
  const reportText = submittedReports.map((report) => String(report?.report || "").toLowerCase()).join("\n");
  const resolvedPriorTasks = (Array.isArray(summary.resolved_prior_tasks) ? summary.resolved_prior_tasks : [])
    .filter((item) => item?.carryover_id && COMPLETION_EVIDENCE.test(String(item.evidence || "")) && reportText.includes(String(item.evidence || "").toLowerCase()))
    .map((item) => ({ carryover_id: item.carryover_id, evidence: item.evidence }));
  const resolvedIds = new Set(resolvedPriorTasks.map((item) => item.carryover_id));
  priorTasks.forEach((task) => {
    if (!task?.carryover_id || resolvedIds.has(task.carryover_id)) return;
    const completedMatch = completedWork.find((item) => sameProject(task.project, item.project) && sameTask(task.details, `${item.details || ""} ${item.evidence || ""}`));
    let evidence = completedMatch?.evidence || completedMatch?.details || "";
    if (!evidence && MATERIAL_ACTION.test(String(task.details || ""))) {
      const report = submittedReports.find((item) => sameProject(task.project, item.project) && String(item.report || "").split(/(?<=[.!?])\s+|[;\n]+/).some((part) => /\b(ordered|purchased|bought|procured)\b/i.test(part) && sameTask(task.details, part)));
      if (report) evidence = String(report.report || "").split(/(?<=[.!?])\s+|[;\n]+/).find((part) => /\b(ordered|purchased|bought|procured)\b/i.test(part) && sameTask(task.details, part)) || "";
    }
    if (!evidence) return;
    resolvedIds.add(task.carryover_id);
    resolvedPriorTasks.push({ carryover_id: task.carryover_id, evidence: evidence.trim() });
  });
  const tomorrowPlan = (Array.isArray(summary.tomorrow_plan) ? summary.tomorrow_plan : []).filter((item) => !item?.carryover_id || !resolvedIds.has(item.carryover_id));
  const includedIds = new Set(tomorrowPlan.map((item) => item?.carryover_id).filter(Boolean));
  const requiredCarryovers = priorTasks.filter((task) => task?.carryover_id && !resolvedIds.has(task.carryover_id) && !includedIds.has(task.carryover_id)).map((task) => ({
    project: task.project || "General",
    details: task.details,
    reported_by: task.reported_by || [],
    evidence: task.details,
    source: "carryover",
    source_date: task.source_date || null,
    carryover_id: task.carryover_id,
  }));
  const finalTomorrowPlan = [...tomorrowPlan, ...requiredCarryovers];
  const materialsNeeded = (Array.isArray(summary.materials_needed) ? summary.materials_needed : []).flatMap(materialNeedItems);
  const labor = (Array.isArray(summary.labor) ? summary.labor : []).filter((item) =>
    !LABOR_NOT_YET_PERFORMED.test(`${item?.details || ""} ${item?.evidence || ""}`)
  );
  const blockersAndDelays = Array.isArray(summary.blockers_and_delays) ? [...summary.blockers_and_delays] : [];
  submittedReports.forEach((report) => {
    String(report?.report || "").split(/(?<=[.!?])\s+|[;\n]+/).map((part) => part.trim()).filter((part) => part && EXPLICIT_BLOCKER.test(part)).forEach((evidence) => {
      const item = { project: report.project || "General", details: evidence, reported_by: [report.submitted_by].filter(Boolean), evidence };
      if (!summaryItemAlreadyIncluded(blockersAndDelays, item)) blockersAndDelays.push(item);
    });
  });
  const risks = Array.isArray(summary.risks) ? [...summary.risks] : [];
  const riskKeys = new Set(risks.map(riskKey));
  submittedReports.forEach((report) => {
    String(report?.report || "").split(/(?<=[.!?])\s+|[;\n]+/).map((part) => part.trim()).filter((part) => part && EXPLICIT_RISK.test(part)).forEach((evidence) => {
      const item = { project: report.project || "General", details: evidence, reported_by: [report.submitted_by].filter(Boolean), evidence };
      const key = riskKey(item);
      if (!riskKeys.has(key)) risks.push(item);
      riskKeys.add(key);
    });
  });
  finalTomorrowPlan.filter((item) => MATERIAL_ACTION.test(String(item?.details || ""))).forEach((item) => {
    const project = String(item.project || "General").toLowerCase();
    const key = materialKey(item.details);
    const existingIndex = materialsNeeded.findIndex((material) =>
      (item.carryover_id && material?.carryover_id === item.carryover_id)
      || (String(material?.project || "General").toLowerCase() === project && key && materialKey(material?.details) === key)
    );
    if (existingIndex >= 0) {
      materialsNeeded[existingIndex] = { ...materialsNeeded[existingIndex], source: item.source, source_date: item.source_date, carryover_id: item.carryover_id };
      return;
    }
    materialsNeeded.push({ ...item, evidence: item.evidence || item.details });
  });
  const resolvedTasks = priorTasks.filter((task) => resolvedIds.has(task.carryover_id));
  const overdueWork = (Array.isArray(summary.overdue_work) ? summary.overdue_work : []).filter((item) => !resolvedTasks.some((task) => sameProject(task.project, item.project) && sameTask(task.details, item.details)));
  const finalMaterialsNeeded = materialsNeeded.filter((item) => !/^\s*(order|buy|purchase|procure)\b/i.test(String(item.details || "")) || !resolvedTasks.some((task) => sameProject(task.project, item.project) && sameTask(task.details, item.details)));
  return { ...summary, completed_work: completedWork, blockers_and_delays: blockersAndDelays, inspections, tomorrow_plan: finalTomorrowPlan, labor, materials_needed: finalMaterialsNeeded, overdue_work: overdueWork, risks, resolved_prior_tasks: resolvedPriorTasks };
}

export { sanitizeSummary };

const CONSTRUCTION_GLOSSARY = `
Apply this L&A Custom Homes glossary exactly:
Poly (پُلی/پلی) is a person's name, never plate compactor. Subfloor (ساب فلور/ساب‌فلور) means subfloor, never scaffolding. تراک کانکریت means a truckload of concrete.
Standard terms include excavation, grading, compaction, trench, backfill, layout, survey, footing, foundation, formwork/forms, rebar, anchor bolt, slab, stem wall, retaining wall, waterproofing, drainage, concrete pump, framing, joist, beam, header, shear wall, sheathing, blocking, truss, roofing, rough-in, MEP, plumbing, electrical, HVAC, ductwork, fire sprinkler, low voltage, insulation, drywall/sheetrock, taping, texture, stucco, siding, flashing, scaffolding, windows, doors, cabinets, countertops, tile, hardwood, flooring, baseboard, trim, painting, finish carpentry, inspection, correction notice, punch list, change order, RFI, submittal, material delivery, subcontractor/sub, superintendent, foreman and crew.
Persian speakers frequently pronounce these as English loanwords; translate them to the matching standard English construction term. Preserve all people, company and project names, addresses, dates, times, measurements and quantities exactly. If an unfamiliar word may be a name or specialized term, transliterate it instead of inventing or substituting an unrelated item.`;

const SUMMARY_ITEM_PROPERTIES = {
  project: { type: "string" },
  details: { type: "string" },
  reported_by: { type: "array", items: { type: "string" } },
  evidence: { type: "string" },
};
const SUMMARY_ITEM_SCHEMA = { type: "object", additionalProperties: false, properties: SUMMARY_ITEM_PROPERTIES, required: Object.keys(SUMMARY_ITEM_PROPERTIES) };
const DAILY_SUMMARY_FORMAT = {
  type: "json_schema",
  name: "daily_construction_summary",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      executive_summary: { type: "string" },
      completed_work: { type: "array", items: SUMMARY_ITEM_SCHEMA },
      blockers_and_delays: { type: "array", items: SUMMARY_ITEM_SCHEMA },
      tomorrow_plan: { type: "array", items: { type: "object", additionalProperties: false, properties: { ...SUMMARY_ITEM_PROPERTIES, source: { type: "string", enum: ["today", "carryover"] }, source_date: { type: "string" }, carryover_id: { anyOf: [{ type: "string" }, { type: "null" }] } }, required: [...Object.keys(SUMMARY_ITEM_PROPERTIES), "source", "source_date", "carryover_id"] } },
      labor: { type: "array", items: SUMMARY_ITEM_SCHEMA },
      inspections: { type: "array", items: SUMMARY_ITEM_SCHEMA },
      materials_needed: { type: "array", items: SUMMARY_ITEM_SCHEMA },
      overdue_work: { type: "array", items: SUMMARY_ITEM_SCHEMA },
      risks: { type: "array", items: SUMMARY_ITEM_SCHEMA },
      contributors: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, projects: { type: "array", items: { type: "string" } } }, required: ["name", "projects"] } },
      resolved_prior_tasks: { type: "array", items: { type: "object", additionalProperties: false, properties: { carryover_id: { type: "string" }, evidence: { type: "string" } }, required: ["carryover_id", "evidence"] } },
    },
    required: ["executive_summary", "completed_work", "blockers_and_delays", "tomorrow_plan", "labor", "inspections", "materials_needed", "overdue_work", "risks", "contributors", "resolved_prior_tasks"],
  },
};

export default async (request) => {
  if (request.method === "GET") return json(200, { service: "report-ai", version: REPORT_AI_VERSION });
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
    ? `Create a professional 5 PM English construction management summary from the submitted daily field reports and the open action-item history reconstructed from every earlier daily summary. ${CONSTRUCTION_GLOSSARY}
Never invent facts, assumptions, safety events, delays, or tomorrow tasks. Preserve exact names, project names, quantities, times, dates, and construction terms. Use normal name capitalization without changing the name. Merge duplicate facts only when they clearly describe the same work. Never combine unrelated tasks, inspections, deliveries, or issues into one item. If reports conflict, keep both facts and identify their reporters.
Treat every fact as one atomic statement. Categories are not mutually exclusive: the same supported fact must appear in every category it affects. For example, "order soft filler" is both a tomorrow/open task and a material need; a broken planer causing idle labor is both a labor fact and a blocker. For every categorized item, evidence must be a short exact excerpt copied from a submitted report. Never use AI-written wording as evidence.
Classification rules:
- Completed work must be explicitly finished, completed, passed, delivered, or performed. Work that only started, began, is underway, is scheduled, or remains pending is not completed. Every completed_work details string may contain only completed facts; remove started or pending clauses even when they appear beside completed work in the same source sentence.
- Materials needed contains materials explicitly needed, missing, ordered but not received, awaiting delivery, or that must be ordered, bought, purchased, procured, or sourced. Every open task to order or purchase a material must also appear in materials_needed. Preserve the exact material name from the report or carryover task. A delivered material is not "needed" unless the report explicitly says more is required.
- Inspections contains only an actual inspection, inspector visit, inspection result, correction notice, or explicitly requested inspection. Do not turn a generic check, installation, removal, reinstallation, repair, or Monday work into an inspection.
- Overdue work requires explicit evidence that work is late, missed, overdue, unfinished past its expected time, or carried over. A general blocker is not automatically overdue.
- Risks contains only the actual risk, hazard, complaint, or concern. Describe it in natural management English. Never call enforcement, PPE use, a safety meeting, or another corrective action a "safety risk"; include a corrective action only after naming an explicit underlying hazard or noncompliance.
- Prior open action items are the still-unresolved tasks reconstructed chronologically from all earlier daily summaries, not only the previous day. Remove one only when today's submitted reports explicitly confirm that same task was completed. List such confirmations in resolved_prior_tasks using the exact carryover_id and an exact completion excerpt from today's report. If it is not mentioned, is ambiguous, remains pending, or is only underway, include it in tomorrow_plan with source "carryover", the same carryover_id, and its original source_date. Never treat silence as completion.
- New explicit next steps from today's reports go in tomorrow_plan with source "today" and source_date set to the submitted report date.
Return only valid JSON with exactly this structure:
{
  "executive_summary": "A concise overall conclusion for the day.",
  "completed_work": [{"project":"Project name","details":"Work completed","reported_by":["Person name"],"evidence":"Exact report excerpt"}],
  "blockers_and_delays": [{"project":"Project name","details":"Issue or delay","reported_by":["Person name"],"evidence":"Exact report excerpt"}],
  "tomorrow_plan": [{"project":"Project name","details":"Next or carried-over work","reported_by":["Person name"],"evidence":"Exact report excerpt or exact prior task text","source":"today or carryover","source_date":"YYYY-MM-DD","carryover_id":"Exact prior ID for carryovers, otherwise null"}],
  "labor": [{"project":"Project name","details":"Crew, trade, worker count, hours, or labor activity","reported_by":["Person name"],"evidence":"Exact report excerpt"}],
  "inspections": [{"project":"Project name","details":"Inspection status, result, correction, or explicitly requested inspection","reported_by":["Person name"],"evidence":"Exact excerpt containing inspection evidence"}],
  "materials_needed": [{"project":"Project name","details":"Material explicitly needed, ordered, missing, or awaiting delivery","reported_by":["Person name"],"evidence":"Exact report excerpt"}],
  "overdue_work": [{"project":"Project name","details":"Work explicitly reported late, missed, unfinished, or carried over","reported_by":["Person name"],"evidence":"Exact report excerpt or exact prior task text"}],
  "risks": [{"project":"Project name","details":"Explicit schedule, safety, quality, cost, access, weather, or coordination risk","reported_by":["Person name"],"evidence":"Exact report excerpt"}],
  "contributors": [{"name":"Person name","projects":["Project name"]}],
  "resolved_prior_tasks": [{"carryover_id":"Exact prior ID","evidence":"Exact excerpt from today's report explicitly confirming completion"}]
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
  const input = isSummary ? JSON.stringify({ report_date: body.report_date || null, reports: body.reports || [], prior_open_tasks: body.prior_open_tasks || [] }) : String(body.text || "");
  if (!input.trim()) return json(400, { error: "Report text is required" });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${openaiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: Netlify.env.get("OPENAI_MODEL") || "gpt-4.1-mini", instructions, input, max_output_tokens: isSummary ? 4500 : 2500, ...(isSummary ? { text: { format: DAILY_SUMMARY_FORMAT } } : {}) }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const errorCode = failure?.error?.code || failure?.error?.type || `openai_${response.status}`;
    console.error("OpenAI report processing failed", response.status, errorCode, failure?.error?.message || "Unknown upstream error");
    return json(502, { error: isSummary ? "The 5 PM summary is temporarily unavailable. Please try again." : "AI report processing is temporarily unavailable. Please try again.", error_code: errorCode });
  }
  const responseData = await response.json().catch(() => null);
  const text = outputText(responseData || {}).trim();
  if (!text) return json(502, { error: "The AI service returned an empty response. Please try again." });
  if (isSummary) {
    try {
      const dailySummary = sanitizeSummary(parseModelJson(text), body.prior_open_tasks || [], body.reports || []);
      return json(200, { daily_summary: dailySummary, english_summary: JSON.stringify(dailySummary), processing_version: REPORT_AI_VERSION });
    } catch (error) {
      console.error("Daily analysis JSON failed", error?.message || "Unknown parsing error");
      return json(502, { error: "The daily analysis could not be structured. Please try again.", error_code: "invalid_summary_json" });
    }
  }
  try {
    const report = sanitizeReport(parseModelJson(text));
    return json(200, { ...report, structured_report: report, processing_version: REPORT_AI_VERSION });
  } catch {
    return json(502, { error: "The AI report could not be structured. Please try again." });
  }
};
