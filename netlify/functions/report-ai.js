function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

const REPORT_AI_VERSION = "2026-08-31-task-resolution-v14";

const TEXT_MODEL_PRICING = [
  { pattern: /^gpt-4\.1-mini(?:-|$)/i, input: 0.40, cachedInput: 0.10, output: 1.60 },
];

function aiUsage(responseData, model, operation, durationMs) {
  const usage = responseData?.usage || {};
  const inputTokens = Number(usage.input_tokens) || 0;
  const cachedInputTokens = Math.min(inputTokens, Number(usage.input_tokens_details?.cached_tokens) || 0);
  const outputTokens = Number(usage.output_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || inputTokens + outputTokens;
  const pricing = TEXT_MODEL_PRICING.find((entry) => entry.pattern.test(model));
  const estimatedCostUsd = pricing
    ? (((inputTokens - cachedInputTokens) * pricing.input) + (cachedInputTokens * pricing.cachedInput) + (outputTokens * pricing.output)) / 1_000_000
    : null;
  return {
    provider: "OpenAI",
    operation,
    model,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCostUsd === null ? null : Number(estimatedCostUsd.toFixed(8)),
    duration_ms: Math.max(0, Number(durationMs) || 0),
  };
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

const INCOMPLETE_WORK = /\b(start(?:ed|ing)?|began|beginning|underway|in progress|scheduled|planned|pending|will|to be)\b/i;
const COMPLETION_EVIDENCE = /\b(completed?|finished|done|resolved|installed|delivered|passed|repaired|corrected|closed|removed|changed|widened|cleaned|compacted|added|performed)\b/i;
const MATERIAL_ACTION = /\b(order(?:ed|ing)?|buy|purchase(?:d|ing)?|procure(?:d|ment|ing)?|source|material(?:s)?\s+(?:needed|required|missing|insufficient))\b/i;
const MATERIAL_ALREADY_AVAILABLE = /\b(delivered|received|purchased|bought|available|on[- ]?site|awaiting (?:pickup|installation)|waiting (?:for )?(?:pickup|installation))\b/i;
const MATERIAL_CANCELLED = /\b(cancel(?:led|ed|ing)?|void(?:ed)?|no longer (?:needed|required)|do not order|don't order|return(?:ed|ing)? instead)\b/i;
const MATERIAL_OBJECT_AFTER_ACTION = /\b(?:order(?:ed|ing)?|buy|purchase(?:d|ing)?|procure(?:d|ment|ing)?|source)\s+(?!(?:was|were|is|are|has|had|for|from|of|on|about|regarding|subject)\b)(?:the\s+|some\s+|more\s+|additional\s+)?[a-z0-9]/i;
const MATERIAL_OBJECT_BEFORE_ACTION = /\b[a-z0-9][a-z0-9 /#&-]{1,60}\s+(?:ordered|purchased|procured|backordered|awaiting delivery|scheduled for delivery|expected to arrive)\b/i;
const LABOR_NOT_YET_PERFORMED = /\b(will|scheduled|plans? to|pending|responsible for|to (?:pick|deliver|install|start|begin|return|come|reinstall))\b/i;
const INSPECTION_EVIDENCE = /\b(inspect(?:ion|or|ed|ing)?|correction notice|sign[- ]?off)\b/i;
const EXPLICIT_RISK = /\b(risk|hazard|concern|noise complaint|complaint.{0,30}noise|not wearing (?:helmets?|vests?|ppe)|without (?:helmets?|vests?|ppe)|safety (?:violation|hazard|concern|issue)|unsafe|injur(?:y|ed)|accident)\b/i;
const EXPLICIT_BLOCKER = /\b(incorrect(?:ly)?|wrong|misinstall(?:ed|ation)?|improperly installed|not (?:right|correct)|damaged|broken|failed|missing|shortage|delay(?:ed)?|held up|cannot|can't|unable|stopped|blocked|retrofit|should (?:have been|be)|needs? (?:repair|replacement|correction|rework|return)|requires? (?:repair|replacement|correction|rework|epoxy|new rebar))\b/i;

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
  const text = String(value || "").toLowerCase();
  if (/\bsubfloor\b/.test(text) && /\bwood\b/.test(text)) return "subfloor-wood";
  if (/\bv9\b/.test(text) && /\bbox extension\b/.test(text)) return "v9-box-extension";
  if (/\bramon\b/.test(text) && /\blights?\b/.test(text)) return "ramon-lights";
  if (/\bgolden state\b/.test(text) && /\bwhite cap\b/.test(text)) return "golden-state-white-cap-order";
  const ignored = new Set(["a", "an", "the", "to", "be", "is", "are", "was", "were", "must", "should", "for", "material", "materials", "need", "needed", "needs", "require", "required", "missing", "insufficient", "order", "ordered", "ordering", "buy", "purchase", "purchased", "purchasing", "procure", "procured", "procurement", "procuring", "source"]);
  return text.match(/[a-z0-9]+/g)?.filter((word) => !ignored.has(word)).sort().join(" ") || "";
}

function taskKeywords(value) {
  const ignored = new Set(["a", "an", "the", "to", "be", "is", "are", "was", "were", "from", "of", "on", "at", "in", "for", "and", "or", "then", "by", "with", "using", "now", "need", "needs", "require", "requires", "requiring", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "thirty", "material", "materials", "remove", "removed", "order", "ordered", "buy", "bought", "purchase", "purchased", "procure", "receive", "received", "start", "started", "continue", "continued", "install", "installed", "installation", "apply", "applied", "widen", "widened", "change", "changed", "complete", "completed"]);
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9]+/g)?.map((word) => word.endsWith("s") && word.length > 4 ? word.slice(0, -1) : word).filter((word) => !ignored.has(word)) || [])];
}

function sameTask(task, evidence) {
  const keywords = taskKeywords(task);
  if (!keywords.length) return false;
  const evidenceWords = new Set(taskKeywords(evidence));
  const matches = keywords.filter((word) => evidenceWords.has(word)).length;
  return matches >= Math.max(1, Math.ceil(keywords.length * 0.5));
}

function sameProject(left, right) {
  return String(left || "General").trim().toLowerCase() === String(right || "General").trim().toLowerCase();
}

function summaryItemAlreadyIncluded(items, candidate) {
  return items.some((item) => sameProject(item?.project, candidate?.project)
    && (sameTask(item?.details, candidate?.details) || sameTask(item?.evidence, candidate?.evidence)));
}

function blockerKey(item) {
  const text = `${item?.details || ""} ${item?.evidence || ""}`.toLowerCase();
  const topic = /\brebar\b|\bpier cages?\b/.test(text) ? "rebar-pier"
    : /\bramon\b|\b(?:low|high)[- ]?voltage\b/.test(text) ? "ramon-voltage"
      : taskKeywords(text).slice(0, 4).sort().join("-");
  return `${String(item?.project || "General").toLowerCase()}::${topic}`;
}

function isActionableMaterial(value) {
  const details = String(value || "").trim();
  if (!details || MATERIAL_CANCELLED.test(details)) return false;
  return MATERIAL_OBJECT_AFTER_ACTION.test(details) || MATERIAL_OBJECT_BEFORE_ACTION.test(details)
    || /\bmaterial(?:s)?\s+(?:needed|required|missing|insufficient)\b/i.test(details)
    || /\b(?:needed|required|missing|insufficient|awaiting delivery|backordered)\b/i.test(details);
}

function materialNeedItems(item) {
  return String(item?.details || "").split(/;\s*|\s+and\s+(?=(?:purchased|bought|received|delivered)\b)/i).map((details) => ({ ...item, details: details.trim() })).filter((part) => {
    const details = part.details;
    if (!isActionableMaterial(details)) return false;
    const explicitlyPending = /\b(ordered|ordering|awaiting delivery|expected to arrive|not (?:yet )?received|backordered|must be ordered|needs? to be ordered)\b/i.test(details);
    const explicitlyAvailable = /\b(purchased|bought|received|delivered|available|on[- ]?site|payment made)\b/i.test(details);
    const moreRequired = /\b(more|additional|still)\b.{0,25}\b(needed|required|order)\b/i.test(details);
    return !explicitlyAvailable || explicitlyPending || moreRequired;
  });
}

function mergeRelatedMaterialItems(items) {
  const consumed = new Set();
  const result = [];
  items.forEach((item, index) => {
    if (consumed.has(index)) return;
    if (!/\b(?:low|high)[- ]?voltage\b/i.test(String(item?.details || ""))) { result.push(item); return; }
    const reporter = item.reported_by?.[0] || "";
    const group = items.map((candidate, candidateIndex) => ({ candidate, candidateIndex })).filter(({ candidate, candidateIndex }) => !consumed.has(candidateIndex)
      && sameProject(item?.project, candidate?.project)
      && (!reporter || !candidate.reported_by?.length || candidate.reported_by.includes(reporter))
      && (/\b(?:low|high)[- ]?voltage\b/i.test(String(candidate?.details || ""))
        || /\b(?:client|customer)\b.{0,80}\b(?:purchase|buy|order)\b|\boriginal order\b.{0,50}\breturn(?:ed|ing)?\b/i.test(String(candidate?.details || ""))));
    group.forEach(({ candidateIndex }) => consumed.add(candidateIndex));
    const fragments = [...new Map(group.flatMap(({ candidate }) => String(candidate.details || "").split(/[.;]\s*/)).map((part) => part.trim()).filter(Boolean).map((part) => [part.toLowerCase(), part])).values()];
    const shortest = (matches) => [...matches].sort((left, right) => left.length - right.length)[0];
    const voltageFragments = fragments.filter((part) => /\b(?:low|high)[- ]?voltage\b/i.test(part));
    const pureVoltageFragments = voltageFragments.filter((part) => !/\b(?:client|customer|purchase|buy|original order|return(?:ed|ing)?)\b/i.test(part));
    const selectedDetails = [shortest(pureVoltageFragments.length ? pureVoltageFragments : voltageFragments), shortest(fragments.filter((part) => /\b(?:client|customer)\b.{0,80}\b(?:purchase|buy|order)\b/i.test(part))), shortest(fragments.filter((part) => /\boriginal order\b.{0,50}\breturn(?:ed|ing)?\b/i.test(part)))].filter(Boolean);
    const uniqueDetails = [...new Map(selectedDetails.map((part) => [part.toLowerCase(), part])).values()];
    const reportedBy = [...new Set(group.flatMap(({ candidate }) => candidate.reported_by || []))];
    const evidence = [...new Set(group.map(({ candidate }) => String(candidate.evidence || candidate.details || "").trim()).filter(Boolean))].join(" ");
    result.push({ ...item, details: `${uniqueDetails.join("; ")}.`, reported_by: reportedBy, evidence });
  });
  return result;
}

function completedClauses(value) {
  return String(value || "")
    .split(/(?<=[.!?])\s+|;\s*|,\s+(?=and\s+there\b)/i)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part || !COMPLETION_EVIDENCE.test(part) || INCOMPLETE_WORK.test(part)) return false;
      const unresolvedProblem = /\b(did not|was not|were not|incorrect(?:ly)?|not\b.{0,30}\bcorrect|there (?:is|was) an issue)\b/i.test(part);
      const explicitlyResolved = /\b(resolved|corrected|repaired|fixed)\b/i.test(part);
      const nonFieldContribution = /\b(?:contributed|shared|provided)\b.{0,50}\b(?:ideas?|details?|suggestions?)\b|\badded details\b/i.test(part);
      return (!unresolvedProblem || explicitlyResolved) && !nonFieldContribution;
    });
}

function futureDates(value, referenceDate) {
  if (!referenceDate) return [];
  const reference = new Date(`${referenceDate}T23:59:59`);
  if (Number.isNaN(reference.getTime())) return [];
  const dates = [];
  const addIfFuture = (year, month, day, original) => {
    const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
    if (!Number.isNaN(date.getTime()) && date > reference) dates.push(original);
  };
  String(value || "").replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (original, month, day, year) => {
    addIfFuture(year, month, day, original);
    return original;
  }).replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (original, year, month, day) => {
    addIfFuture(year, month, day, original);
    return original;
  });
  return dates;
}

function hasFutureDate(value, referenceDate) {
  return futureDates(value, referenceDate).length > 0;
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

function sanitizeReport(report, reportDate = "") {
  const completed = (Array.isArray(report.completed) ? report.completed : [])
    .flatMap(completedClauses)
    .filter((item) => !hasFutureDate(item, reportDate));
  const inspection = Array.isArray(report.inspection) ? report.inspection.filter(Boolean) : [];
  const nextActions = Array.isArray(report.next_actions) ? report.next_actions.filter(Boolean) : [];
  inspection.filter((item) => hasFutureDate(item, reportDate)).forEach((item) => {
    if (!nextActions.some((action) => sameTask(action, item))) nextActions.push(item);
  });
  return { ...report, completed, inspection, next_actions: nextActions };
}

function sanitizeSummary(summary, priorTasks = [], submittedReports = [], reportDate = "") {
  const completedWork = (Array.isArray(summary.completed_work) ? summary.completed_work : []).flatMap(atomicSummaryItems).flatMap((item) => {
    if (hasFutureDate(`${item?.details || ""} ${item?.evidence || ""}`, reportDate)) return [];
    const clauses = completedClauses(item?.details);
    return clauses.length ? [{ ...item, details: clauses.join(" ") }] : [];
  });
  submittedReports.forEach((report) => {
    completedClauses(report?.report || "").forEach((evidence) => {
      if (hasFutureDate(evidence, reportDate)) return;
      const item = { project: report.project || "General", details: evidence, reported_by: [report.submitted_by].filter(Boolean), evidence };
      if (!summaryItemAlreadyIncluded(completedWork, item)) completedWork.push(item);
    });
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
    if (!evidence) {
      for (const report of submittedReports.filter((item) => sameProject(task.project, item.project))) {
        const clause = String(report.report || "").split(/(?<=[.!?])\s+|[;\n]+/).find((part) => COMPLETION_EVIDENCE.test(part) && !INCOMPLETE_WORK.test(part) && sameTask(task.details, part));
        if (clause) { evidence = clause; break; }
      }
    }
    if (!evidence && MATERIAL_ACTION.test(String(task.details || ""))) {
      const report = submittedReports.find((item) => sameProject(task.project, item.project) && String(item.report || "").split(/(?<=[.!?])\s+|[;\n]+/).some((part) => /\b(ordered|purchased|bought|procured)\b/i.test(part) && sameTask(task.details, part)));
      if (report) evidence = String(report.report || "").split(/(?<=[.!?])\s+|[;\n]+/).find((part) => /\b(ordered|purchased|bought|procured)\b/i.test(part) && sameTask(task.details, part)) || "";
    }
    if (!evidence) return;
    resolvedIds.add(task.carryover_id);
    resolvedPriorTasks.push({ carryover_id: task.carryover_id, evidence: evidence.trim() });
  });
  const tomorrowPlan = (Array.isArray(summary.tomorrow_plan) ? summary.tomorrow_plan : []).filter((item) => !item?.carryover_id || !resolvedIds.has(item.carryover_id));
  submittedReports.forEach((report) => {
    (Array.isArray(report?.structured_next_actions) ? report.structured_next_actions : []).forEach((nextAction) => {
      const details = String(nextAction?.details || nextAction || "").trim();
      if (!details) return;
      const candidate = {
        project: report.project || "General",
        details,
        reported_by: [report.submitted_by].filter(Boolean),
        evidence: details,
        source: "today",
        source_date: report.report_date || reportDate || null,
        carryover_id: null,
      };
      const explicitlyCompleted = completedWork.some((item) => sameProject(item?.project, candidate.project)
        && sameTask(details, `${item?.details || ""} ${item?.evidence || ""}`));
      if (!explicitlyCompleted && !summaryItemAlreadyIncluded(tomorrowPlan, candidate)) tomorrowPlan.push(candidate);
    });
  });
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
  const recoveredMaterials = submittedReports.flatMap((report) => String(report?.report || "").split(/(?<=[.!?])\s+|[;\n]+/).map((part) => part.trim()).filter((part) => part && !MATERIAL_CANCELLED.test(part) && ((MATERIAL_ACTION.test(part) && !MATERIAL_ALREADY_AVAILABLE.test(part) && isActionableMaterial(part)) || /\b(?:low|high)[- ]?voltage\b/i.test(part))).map((evidence) => ({
    project: report.project || "General", details: evidence, reported_by: [report.submitted_by].filter(Boolean), evidence,
  })));
  const materialsNeeded = mergeRelatedMaterialItems([...(Array.isArray(summary.materials_needed) ? summary.materials_needed : []).flatMap(materialNeedItems), ...recoveredMaterials]);
  const labor = (Array.isArray(summary.labor) ? summary.labor : []).filter((item) =>
    !LABOR_NOT_YET_PERFORMED.test(`${item?.details || ""} ${item?.evidence || ""}`)
  );
  const initialBlockers = Array.isArray(summary.blockers_and_delays) ? summary.blockers_and_delays : [];
  const blockersAndDelays = [];
  const addBlocker = (item) => {
    const existingIndex = blockersAndDelays.findIndex((existing) => blockerKey(existing) === blockerKey(item)
      || (sameProject(existing?.project, item?.project) && (sameTask(existing?.details, item?.details) || sameTask(existing?.evidence, item?.evidence))));
    if (existingIndex < 0) { blockersAndDelays.push(item); return; }
    const existing = blockersAndDelays[existingIndex];
    const problemLanguage = /\b(incorrect(?:ly)?|wrong|misinstall(?:ed|ation)?|improperly installed|not (?:right|correct)|damaged|broken|failed|missing|shortage|delay(?:ed)?)\b/i;
    const candidateNamesProblem = problemLanguage.test(`${item?.details || ""} ${item?.evidence || ""}`);
    const existingNamesProblem = problemLanguage.test(`${existing?.details || ""} ${existing?.evidence || ""}`);
    if (candidateNamesProblem && !existingNamesProblem) blockersAndDelays[existingIndex] = item;
  };
  initialBlockers.forEach(addBlocker);
  submittedReports.forEach((report) => {
    String(report?.report || "").split(/(?<=[.!?])\s+|[;\n]+/).map((part) => part.trim()).filter((part) => part && EXPLICIT_BLOCKER.test(part)).forEach((evidence) => {
      const item = { project: report.project || "General", details: evidence, reported_by: [report.submitted_by].filter(Boolean), evidence };
      addBlocker(item);
    });
  });
  const risks = (Array.isArray(summary.risks) ? summary.risks : []).filter((item) => EXPLICIT_RISK.test(`${item?.details || ""} ${item?.evidence || ""}`) || EXPLICIT_BLOCKER.test(`${item?.details || ""} ${item?.evidence || ""}`));
  const riskKeys = new Set(risks.map(riskKey));
  submittedReports.forEach((report) => {
    String(report?.report || "").split(/(?<=[.!?])\s+|[;\n]+/).map((part) => part.trim()).filter((part) => part && EXPLICIT_RISK.test(part)).forEach((evidence) => {
      const item = { project: report.project || "General", details: evidence, reported_by: [report.submitted_by].filter(Boolean), evidence };
      const key = riskKey(item);
      if (!riskKeys.has(key)) risks.push(item);
      riskKeys.add(key);
    });
  });
  [...risks, ...materialsNeeded].filter((item) => EXPLICIT_BLOCKER.test(`${item?.details || ""} ${item?.evidence || ""}`)).forEach(addBlocker);
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
  const finalMaterialsNeeded = [];
  materialsNeeded.filter((item) => !/^\s*(order|buy|purchase|procure)\b/i.test(String(item.details || "")) || !resolvedTasks.some((task) => sameProject(task.project, item.project) && sameTask(task.details, item.details))).forEach((item) => {
    if (!isActionableMaterial(item?.details)) return;
    const existingIndex = finalMaterialsNeeded.findIndex((existing) => sameProject(existing?.project, item?.project)
      && (materialKey(existing?.details) === materialKey(item?.details)
        || sameTask(existing?.details, item?.details)
        || sameTask(item?.details, existing?.details)));
    if (existingIndex < 0) { finalMaterialsNeeded.push(item); return; }
    const existing = finalMaterialsNeeded[existingIndex];
    if (String(item.details || "").length < String(existing.details || "").length) finalMaterialsNeeded[existingIndex] = item;
  });
  return { ...summary, completed_work: completedWork, blockers_and_delays: blockersAndDelays, inspections, tomorrow_plan: finalTomorrowPlan, labor, materials_needed: finalMaterialsNeeded, overdue_work: overdueWork, risks, resolved_prior_tasks: resolvedPriorTasks };
}

export { aiUsage, hasFutureDate, sanitizeReport, sanitizeSummary };

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
- Completed work must be explicitly finished, completed, passed, delivered, or performed. Work that only started, began, is underway, is scheduled, or remains pending is not completed. Every completed_work details string may contain only completed facts; remove started or pending clauses even when they appear beside completed work in the same source sentence. A future-dated inspection is scheduled or booked work, never completed work.
- Materials needed contains materials explicitly needed, missing, ordered but not received, awaiting delivery, or that must be ordered, bought, purchased, procured, or sourced. Every open task to order or purchase a material must also appear in materials_needed. Preserve the exact material name from the report or carryover task. A delivered material is not "needed" unless the report explicitly says more is required.
- Inspections contains only an actual inspection, inspector visit, inspection result, correction notice, or explicitly requested or scheduled inspection. Do not turn a generic check, installation, removal, reinstallation, repair, or Monday work into an inspection. Use report_date as the time reference: an inspection booked for a later date belongs in inspections and tomorrow_plan, not completed_work. Persian wording equivalent to "we got/booked an inspection for [date]" means the inspection was scheduled for that date, not conducted.
- Overdue work requires explicit evidence that work is late, missed, overdue, unfinished past its expected time, or carried over. A general blocker is not automatically overdue.
- Risks contains only the actual risk, hazard, complaint, or concern. Describe it in natural management English. Never call enforcement, PPE use, a safety meeting, or another corrective action a "safety risk"; include a corrective action only after naming an explicit underlying hazard or noncompliance.
- Prior open action items are the still-unresolved tasks reconstructed chronologically from all earlier daily summaries, not only the previous day. Use them only to identify tasks explicitly completed today. Match by project and the substantive work object or area; tolerate tense changes, word-order changes, shortened wording, and clear paraphrases. If today's completion clearly fulfills a prior task, return that prior task's exact carryover_id even when the sentences are not identical. List those confirmations in resolved_prior_tasks with an exact completion excerpt from today's report. The backend appends every unresolved carryover automatically, so do not repeat unresolved prior tasks in tomorrow_plan. Never treat silence or merely related work as completion.
- New explicit next steps from today's reports go in tomorrow_plan with source "today" and source_date set to the submitted report date. Every item supplied in structured_next_actions is a required same-day next action and must be included unless today's report explicitly confirms that exact work was completed.
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
Never invent, infer, or fill in missing facts. Use report_date as the time reference. A task that only started, began, is underway, scheduled, or pending is not completed. Each completed item may contain only completed facts; separate or omit any started or pending clause beside it. A future-dated inspection is scheduled or booked work: include it in inspection and next_actions, never completed. Persian wording equivalent to "inspection گرفتیم برای [date]" means the inspection was booked for that date, not conducted. A delivered material is not a material need unless more is explicitly required. Only place actual inspections, inspector visits, inspection results, correction notices, or requested or scheduled inspections under inspection; never turn a generic check or repair into an inspection. Keep unrelated facts as separate items. Describe risks as the underlying hazard or concern, never as PPE enforcement or another corrective action. Return only valid JSON with exactly this structure:
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
  const priorOpenTasks = Array.isArray(body.prior_open_tasks) ? body.prior_open_tasks : [];
  const reportTextInput = String(body.text || "").trim();
  if (!isSummary && !reportTextInput) return json(400, { error: "Report text is required" });
  const input = isSummary ? JSON.stringify({
    report_date: body.report_date || null,
    reports: body.reports || [],
    prior_open_tasks: priorOpenTasks.map((task) => ({ carryover_id: task.carryover_id, project: task.project, details: task.details })),
  }) : JSON.stringify({ report_date: body.report_date || null, report: reportTextInput });
  if (!input.trim()) return json(400, { error: "Report text is required" });

  const model = Netlify.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${openaiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, instructions, input, max_output_tokens: isSummary ? 3000 : 1800, ...(isSummary ? { text: { format: DAILY_SUMMARY_FORMAT } } : {}) }),
      signal: AbortSignal.timeout(isSummary ? 50_000 : 35_000),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("OpenAI report request failed", timedOut ? "timeout" : (error?.message || "network_error"));
    return json(timedOut ? 504 : 502, {
      error: timedOut ? (isSummary ? "The 5 PM analysis exceeded 50 seconds. Please try again." : "AI report processing timed out. Please try again.") : "The AI service could not be reached. Please try again.",
      error_code: timedOut ? "openai_timeout" : "openai_network_error",
    });
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const errorCode = failure?.error?.code || failure?.error?.type || `openai_${response.status}`;
    console.error("OpenAI report processing failed", response.status, errorCode, failure?.error?.message || "Unknown upstream error");
    return json(502, { error: isSummary ? "The 5 PM summary is temporarily unavailable. Please try again." : "AI report processing is temporarily unavailable. Please try again.", error_code: errorCode });
  }
  const responseData = await response.json().catch(() => null);
  const text = outputText(responseData || {}).trim();
  if (!text) return json(502, { error: "The AI service returned an empty response. Please try again." });
  const usage = aiUsage(responseData, model, isSummary ? "5_pm_summary" : "daily_report", Date.now() - startedAt);
  if (isSummary) {
    try {
      const dailySummary = sanitizeSummary(parseModelJson(text), priorOpenTasks, body.reports || [], body.report_date || "");
      return json(200, { daily_summary: dailySummary, english_summary: JSON.stringify(dailySummary), ai_usage: usage, processing_version: REPORT_AI_VERSION });
    } catch (error) {
      console.error("Daily analysis JSON failed", error?.message || "Unknown parsing error");
      return json(502, { error: "The daily analysis could not be structured. Please try again.", error_code: "invalid_summary_json" });
    }
  }
  try {
    const report = sanitizeReport(parseModelJson(text), body.report_date || "");
    return json(200, { ...report, structured_report: report, ai_usage: usage, processing_version: REPORT_AI_VERSION });
  } catch {
    return json(502, { error: "The AI report could not be structured. Please try again." });
  }
};
