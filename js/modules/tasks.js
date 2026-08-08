function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }

function parseSummary(value) { try { return JSON.parse(value); } catch { return null; } }

function signature(item) {
  return `${String(item?.project || "General").trim().toLowerCase()}::${String(item?.details || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function materialKey(item) {
  const ignored = new Set(["a", "an", "the", "to", "be", "is", "are", "for", "material", "materials", "need", "needed", "order", "ordered", "buy", "purchase", "purchased", "procure", "source"]);
  const words = String(item?.details || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => !ignored.has(word)).sort().join(" ") || "";
  return `${String(item?.project || "General").toLowerCase()}::${words}`;
}

function taskStatus(task) {
  if (task.status === "completed") return "completed";
  if (/\b(started|working|underway|in progress|partially)\b/i.test(task.details)) return "in_progress";
  return "open";
}

function displayName(value) {
  const name = String(value || "").trim();
  if (!name || (name !== name.toLowerCase() && name !== name.toUpperCase())) return name;
  return name.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

export function buildTaskHistory(rows) {
  const tasks = new Map();
  const idsBySignature = new Map();
  const materialKeys = new Set();
  rows.forEach((row) => {
    const summary = parseSummary(row.english_summary);
    if (!summary) return;
    (Array.isArray(summary.materials_needed) ? summary.materials_needed : []).forEach((item) => materialKeys.add(materialKey(item)));
    (Array.isArray(summary.resolved_prior_tasks) ? summary.resolved_prior_tasks : []).forEach((resolved) => {
      const id = resolved?.carryover_id;
      if (!id || !tasks.has(id)) return;
      tasks.set(id, { ...tasks.get(id), status: "completed", completed_date: row.report_date, completion_evidence: resolved.evidence || "Completed in a later daily report" });
    });
    (Array.isArray(summary.tomorrow_plan) ? summary.tomorrow_plan : []).forEach((item, index) => {
      if (!item?.details) return;
      const itemSignature = signature(item);
      const id = item.carryover_id || idsBySignature.get(itemSignature) || `${row.report_date}:${index}`;
      const existing = tasks.get(id);
      tasks.set(id, {
        id,
        project: item.project || "General",
        details: item.details,
        reported_by: item.reported_by || existing?.reported_by || [],
        source_date: existing?.source_date || item.source_date || row.report_date,
        latest_date: row.report_date,
        status: existing?.status === "completed" ? "completed" : "open",
        is_material: materialKeys.has(materialKey(item)) || /\b(order|buy|purchase|procure|source)\b/i.test(item.details),
      });
      idsBySignature.set(itemSignature, id);
    });
  });
  return [...tasks.values()];
}

function renderTask(task) {
  const status = taskStatus(task);
  const statusLabel = status === "completed" ? "Completed" : status === "in_progress" ? "In progress" : "Open";
  const reporters = (task.reported_by || []).map(displayName).join(", ") || "Not specified";
  return `<article class="ai-task-card" data-status="${status}">
    <div class="ai-task-card-header"><strong>${escapeHtml(task.project)}</strong><span class="task-status task-status-${status}">${statusLabel}</span></div>
    <p>${escapeHtml(task.details)}</p>
    <div class="ai-task-meta"><span>Reported by ${escapeHtml(reporters)}</span><span>From ${escapeHtml(task.source_date || task.latest_date)}</span></div>
    ${task.completion_evidence ? `<small>Completion: ${escapeHtml(task.completion_evidence)}</small>` : ""}
  </article>`;
}

export function createTasksModule({ supabase, companyId }) {
  const message = document.querySelector("#tasksMessage");
  const workList = document.querySelector("#openTasksList");
  const materialList = document.querySelector("#materialTasksList");
  const completedList = document.querySelector("#completedTasksList");
  const openCount = document.querySelector("#openTaskCount");
  const materialCount = document.querySelector("#materialTaskCount");
  const completedCount = document.querySelector("#completedTaskCount");

  async function load() {
    message.hidden = true;
    const { data, error } = await supabase.from("daily_report_summaries").select("report_date,english_summary").eq("company_id", companyId).order("report_date", { ascending: true });
    if (error) { message.textContent = "Tasks could not be loaded."; message.hidden = false; return; }
    const tasks = buildTaskHistory(data || []);
    const open = tasks.filter((task) => task.status !== "completed" && !task.is_material);
    const materials = tasks.filter((task) => task.status !== "completed" && task.is_material);
    const completed = tasks.filter((task) => task.status === "completed");
    const sortTasks = (items) => items.sort((a, b) => String(a.project).localeCompare(String(b.project)) || String(a.source_date).localeCompare(String(b.source_date)));
    openCount.textContent = String(open.length);
    materialCount.textContent = String(materials.length);
    completedCount.textContent = String(completed.length);
    workList.innerHTML = sortTasks(open).map(renderTask).join("") || '<p class="tasks-empty">No open work tasks were found.</p>';
    materialList.innerHTML = sortTasks(materials).map(renderTask).join("") || '<p class="tasks-empty">No materials need to be ordered.</p>';
    completedList.innerHTML = sortTasks(completed).map(renderTask).join("") || '<p class="tasks-empty">No completed carryover tasks were found.</p>';
  }
  return { load };
}
