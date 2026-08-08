function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
function parseSummary(value) { try { return JSON.parse(value); } catch { return null; } }
function today() { return new Date().toLocaleDateString("en-CA"); }
function signature(item) { return `${String(item?.project || "General").trim().toLowerCase()}::${String(item?.details || "").trim().toLowerCase().replace(/\s+/g, " ")}`; }
function newId() { return `manual:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }

function materialKey(item) {
  const ignored = new Set(["a", "an", "the", "to", "be", "is", "are", "for", "material", "materials", "need", "needed", "order", "ordered", "buy", "purchase", "purchased", "procure", "source"]);
  const words = String(item?.details || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => !ignored.has(word)).sort().join(" ") || "";
  return `${String(item?.project || "General").toLowerCase()}::${words}`;
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
  const overrides = {};
  rows.forEach((row) => {
    const summary = parseSummary(row.english_summary);
    if (!summary) return;
    (Array.isArray(summary.materials_needed) ? summary.materials_needed : []).forEach((item) => materialKeys.add(materialKey(item)));
  });
  rows.forEach((row) => {
    const summary = parseSummary(row.english_summary);
    if (!summary) return;
    Object.assign(overrides, summary.task_overrides || {});
    (Array.isArray(summary.resolved_prior_tasks) ? summary.resolved_prior_tasks : []).forEach((resolved) => {
      const id = resolved?.carryover_id;
      if (id && tasks.has(id)) tasks.set(id, { ...tasks.get(id), status: "completed", completion_evidence: resolved.evidence || "Completed in a later daily report" });
    });
    (Array.isArray(summary.tomorrow_plan) ? summary.tomorrow_plan : []).forEach((item, index) => {
      if (!item?.details) return;
      const itemSignature = signature(item);
      const id = item.carryover_id || idsBySignature.get(itemSignature) || `${row.report_date}:${index}`;
      const existing = tasks.get(id);
      tasks.set(id, { id, source: "ai", project: item.project || "General", details: item.details, reported_by: item.reported_by || existing?.reported_by || [], assigned_to: existing?.assigned_to || "", due_date: existing?.due_date || "", source_date: existing?.source_date || item.source_date || row.report_date, latest_date: row.report_date, status: existing?.status === "completed" ? "completed" : (/\b(started|working|underway|in progress|partially)\b/i.test(item.details) ? "in_progress" : "open"), is_material: materialKeys.has(materialKey(item)) || /\b(order|buy|purchase|procure|source)\b/i.test(item.details) });
      idsBySignature.set(itemSignature, id);
    });
    (Array.isArray(summary.manual_tasks) ? summary.manual_tasks : []).forEach((task) => {
      if (task?.id && task?.details) tasks.set(task.id, { ...task, source: "manual", project: task.project || "General", source_date: task.source_date || row.report_date });
    });
  });
  return [...tasks.values()].map((task) => ({ ...task, ...(overrides[task.id] || {}) }));
}

function statusOptions(selected) {
  return [["open", "Open"], ["in_progress", "In progress"], ["completed", "Completed"]].map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
}

function renderTask(task, canManage) {
  const status = ["open", "in_progress", "completed"].includes(task.status) ? task.status : "open";
  const reporters = task.source === "manual" ? "Added manually" : `Reported by ${(task.reported_by || []).map(displayName).join(", ") || "Not specified"}`;
  return `<article class="ai-task-card" data-task-id="${escapeHtml(task.id)}">
    <div class="ai-task-card-header"><strong>${escapeHtml(task.project)}</strong>${canManage ? `<select class="task-status-select" aria-label="Task status">${statusOptions(status)}</select>` : `<span class="task-status task-status-${status}">${status === "in_progress" ? "In progress" : status.charAt(0).toUpperCase() + status.slice(1)}</span>`}</div>
    <p>${escapeHtml(task.details)}</p>
    ${task.assigned_to ? `<div class="task-assignee">Assigned to ${escapeHtml(task.assigned_to)}</div>` : ""}
    <div class="ai-task-meta"><span>${escapeHtml(reporters)}</span><span>${task.due_date ? `Due ${escapeHtml(task.due_date)}` : `From ${escapeHtml(task.source_date || task.latest_date)}`}</span></div>
    ${task.completion_evidence ? `<small>Completion: ${escapeHtml(task.completion_evidence)}</small>` : ""}
  </article>`;
}

function emptySummary() {
  return { executive_summary: "", completed_work: [], blockers_and_delays: [], tomorrow_plan: [], labor: [], inspections: [], materials_needed: [], overdue_work: [], risks: [], contributors: [], resolved_prior_tasks: [] };
}

export function createTasksModule({ supabase, companyId, canManage }) {
  const view = document.querySelector("#tasksView");
  const message = document.querySelector("#tasksMessage");
  const formCard = document.querySelector("#manualTaskCard");
  const form = document.querySelector("#manualTaskForm");
  const projectSelect = document.querySelector("#manualTaskProject");
  const assigneeSelect = document.querySelector("#manualTaskAssignee");
  const workList = document.querySelector("#openTasksList");
  const materialList = document.querySelector("#materialTasksList");
  const completedList = document.querySelector("#completedTasksList");
  let rows = [];
  let tasks = [];
  let manualTasks = [];
  let taskOverrides = {};
  formCard.hidden = !canManage;

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("message-error", isError);
    message.hidden = false;
  }

  function readControls() {
    const manualMap = new Map();
    taskOverrides = {};
    rows.forEach((row) => {
      const summary = parseSummary(row.english_summary);
      (Array.isArray(summary?.manual_tasks) ? summary.manual_tasks : []).forEach((task) => manualMap.set(task.id, task));
      Object.assign(taskOverrides, summary?.task_overrides || {});
    });
    manualTasks = [...manualMap.values()];
  }

  async function persistControls() {
    const latest = rows.at(-1);
    const summary = parseSummary(latest?.english_summary) || emptySummary();
    summary.manual_tasks = manualTasks;
    summary.task_overrides = taskOverrides;
    if (latest?.id) {
      const { error } = await supabase.from("daily_report_summaries").update({ english_summary: JSON.stringify(summary), updated_at: new Date().toISOString() }).eq("id", latest.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("daily_report_summaries").upsert({ company_id: companyId, report_date: today(), english_summary: JSON.stringify(summary), updated_at: new Date().toISOString() }, { onConflict: "company_id,report_date" });
      if (error) throw error;
    }
  }

  function render() {
    const open = tasks.filter((task) => task.status !== "completed" && !task.is_material);
    const materials = tasks.filter((task) => task.status !== "completed" && task.is_material);
    const completed = tasks.filter((task) => task.status === "completed");
    const sortTasks = (items) => items.sort((a, b) => String(a.project).localeCompare(String(b.project)) || String(a.source_date).localeCompare(String(b.source_date)));
    document.querySelector("#openTaskCount").textContent = String(open.length);
    document.querySelector("#materialTaskCount").textContent = String(materials.length);
    document.querySelector("#completedTaskCount").textContent = String(completed.length);
    workList.innerHTML = sortTasks(open).map((task) => renderTask(task, canManage)).join("") || '<p class="tasks-empty">No open work tasks were found.</p>';
    materialList.innerHTML = sortTasks(materials).map((task) => renderTask(task, canManage)).join("") || '<p class="tasks-empty">No materials need to be ordered.</p>';
    completedList.innerHTML = sortTasks(completed).map((task) => renderTask(task, canManage)).join("") || '<p class="tasks-empty">No completed tasks were found.</p>';
  }

  async function load() {
    message.hidden = true;
    const [summaryResult, projectResult, memberResult] = await Promise.all([
      supabase.from("daily_report_summaries").select("id,report_date,english_summary").eq("company_id", companyId).order("report_date", { ascending: true }),
      supabase.from("projects").select("name").eq("company_id", companyId).order("name"),
      supabase.from("company_members").select("full_name,email").eq("company_id", companyId).eq("is_active", true).order("full_name"),
    ]);
    if (summaryResult.error || projectResult.error || memberResult.error) { showMessage("Tasks could not be loaded.", true); return; }
    rows = summaryResult.data || [];
    readControls();
    tasks = buildTaskHistory(rows);
    projectSelect.innerHTML = '<option value="General">General / no project</option>' + (projectResult.data || []).map((project) => `<option value="${escapeHtml(project.name)}">${escapeHtml(project.name)}</option>`).join("");
    assigneeSelect.innerHTML = '<option value="">Unassigned</option>' + (memberResult.data || []).map((member) => {
      const name = member.full_name || member.email || "Unnamed user";
      const label = member.full_name && member.email ? `${member.full_name} (${member.email})` : name;
      return `<option value="${escapeHtml(name)}">${escapeHtml(label)}</option>`;
    }).join("");
    render();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canManage) return;
    const button = document.querySelector("#addManualTaskButton");
    button.disabled = true;
    try {
      manualTasks.push({ id: newId(), source: "manual", project: projectSelect.value || "General", details: document.querySelector("#manualTaskDetails").value.trim(), assigned_to: assigneeSelect.value, due_date: document.querySelector("#manualTaskDueDate").value || "", status: document.querySelector("#manualTaskStatus").value, is_material: document.querySelector("#manualTaskType").value === "material", source_date: today() });
      await persistControls();
      form.reset();
      showMessage("Task added successfully.");
      await load();
    } catch { showMessage("The task could not be saved.", true); }
    finally { button.disabled = false; }
  });

  view.addEventListener("change", async (event) => {
    const select = event.target.closest(".task-status-select");
    if (!select || !canManage) return;
    const id = select.closest(".ai-task-card")?.dataset.taskId;
    if (!id) return;
    select.disabled = true;
    try {
      taskOverrides[id] = { ...(taskOverrides[id] || {}), status: select.value, updated_at: new Date().toISOString() };
      await persistControls();
      showMessage("Task status updated.");
      await load();
    } catch { showMessage("The task status could not be saved.", true); select.disabled = false; }
  });

  return { load };
}
