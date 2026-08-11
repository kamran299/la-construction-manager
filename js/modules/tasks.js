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

function assigneeOptions(selected, members) {
  return '<option value="">Unassigned</option>' + members.map((member) => {
    const name = member.full_name || member.email || "Unnamed user";
    const label = member.full_name && member.email ? `${member.full_name} (${member.email})` : name;
    return `<option value="${escapeHtml(name)}"${selected === name ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function renderTask(task, canManage, members) {
  const status = ["open", "in_progress", "completed"].includes(task.status) ? task.status : "open";
  const reporters = task.source === "manual" ? "Added manually" : `Reported by ${(task.reported_by || []).map(displayName).join(", ") || "Not specified"}`;
  return `<article class="ai-task-card" data-task-id="${escapeHtml(task.id)}">
    <div class="ai-task-card-header"><strong>${escapeHtml(task.project)}</strong>${canManage ? `<select class="task-status-select" aria-label="Task status">${statusOptions(status)}</select>` : `<span class="task-status task-status-${status}">${status === "in_progress" ? "In progress" : status.charAt(0).toUpperCase() + status.slice(1)}</span>`}</div>
    <p>${escapeHtml(task.details)}</p>
    ${canManage ? `<label class="task-assignee-control">Assigned to<select class="task-assignee-select">${assigneeOptions(task.assigned_to || "", members)}</select></label>` : (task.assigned_to ? `<div class="task-assignee">Assigned to ${escapeHtml(task.assigned_to)}</div>` : '<div class="task-assignee">Unassigned</div>')}
    <div class="ai-task-meta"><span>${escapeHtml(reporters)}</span><span>${task.due_date ? `Due ${escapeHtml(task.due_date)}` : `From ${escapeHtml(task.source_date || task.latest_date)}`}</span></div>
    ${task.completion_evidence ? `<small>Completion: ${escapeHtml(task.completion_evidence)}</small>` : ""}
  </article>`;
}

function emptySummary() {
  return { executive_summary: "", completed_work: [], blockers_and_delays: [], tomorrow_plan: [], labor: [], inspections: [], materials_needed: [], overdue_work: [], risks: [], contributors: [], resolved_prior_tasks: [] };
}

function taskStatusLabel(status) {
  return status === "in_progress" ? "In progress" : status === "completed" ? "Completed" : "Open";
}

function renderPdfTask(task) {
  const source = task.source === "manual" ? "Added manually" : `Reported by ${(task.reported_by || []).map(displayName).join(", ") || "Not specified"}`;
  const date = task.due_date ? `Due ${task.due_date}` : `From ${task.source_date || task.latest_date || "Unknown date"}`;
  return `<article class="pdf-task"><header><strong>${escapeHtml(task.project || "General")}</strong><span class="status status-${escapeHtml(task.status || "open")}">${escapeHtml(taskStatusLabel(task.status))}</span></header><p>${escapeHtml(task.details)}</p><div class="pdf-task-assignment"><b>Assigned to:</b> ${escapeHtml(task.assigned_to || "Unassigned")}</div><footer><span>${escapeHtml(source)}</span><span>${escapeHtml(date)}</span></footer>${task.completion_evidence ? `<small><b>Completion:</b> ${escapeHtml(task.completion_evidence)}</small>` : ""}</article>`;
}

function renderPdfTaskSection(title, subtitle, items, emptyText) {
  return `<section class="pdf-task-section"><header><div><span>${escapeHtml(subtitle)}</span><h2>${escapeHtml(title)}</h2></div><strong>${items.length}</strong></header>${items.length ? items.map(renderPdfTask).join("") : `<p class="pdf-empty">${escapeHtml(emptyText)}</p>`}</section>`;
}

function printTasksPdf(tasks) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Please allow pop-ups so the tasks PDF can open.");
  const sorted = (items) => [...items].sort((left, right) => String(left.project || "General").localeCompare(String(right.project || "General")) || String(left.due_date || left.source_date || "").localeCompare(String(right.due_date || right.source_date || "")));
  const open = sorted(tasks.filter((task) => task.status !== "completed" && !task.is_material));
  const materials = sorted(tasks.filter((task) => task.status !== "completed" && task.is_material));
  const completed = sorted(tasks.filter((task) => task.status === "completed"));
  const body = `${renderPdfTaskSection("Work to do", "Action list", open, "No open work tasks were found.")}${renderPdfTaskSection("Materials to order", "Purchasing", materials, "No materials need to be ordered.")}${renderPdfTaskSection("Completed tasks", "History", completed, "No completed tasks were found.")}`;
  printWindow.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Task Manager</title><style>
    @page{size:letter;margin:.48in}*{box-sizing:border-box}body{margin:0;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:9.5pt;line-height:1.4}.print-button{position:fixed;right:18px;top:18px;border:0;border-radius:9px;background:#e96614;color:#fff;padding:11px 16px;font-weight:800}.pdf-heading{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #e96614;padding-bottom:13px;margin-bottom:17px}.brand{display:flex;align-items:center;gap:10px}.brand-mark{display:grid;place-items:center;width:44px;height:44px;border:2px solid #e96614;border-radius:12px;font-weight:900}.brand strong{display:block;font-size:15pt}.brand small,.pdf-heading>div:last-child{color:#667085}.pdf-heading>div:last-child{text-align:right}.pdf-heading h1{font-size:19pt;margin:3px 0}.pdf-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:16px}.pdf-summary div{padding:10px 12px;border:1px solid #dfe3ea;border-radius:10px}.pdf-summary span{display:block;color:#667085;font-size:8pt}.pdf-summary strong{font-size:16pt}.pdf-task-section{margin-bottom:15px}.pdf-task-section>header{display:flex;align-items:end;justify-content:space-between;border-bottom:2px solid #e96614;padding-bottom:6px;margin-bottom:8px;break-after:avoid-page}.pdf-task-section>header span{color:#e96614;font-size:7.5pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.pdf-task-section h2{margin:1px 0 0;font-size:14pt}.pdf-task-section>header>strong{font-size:16pt}.pdf-task{break-inside:avoid-page;border:1px solid #dfe3ea;border-radius:11px;padding:10px 12px;margin-bottom:7px}.pdf-task header,.pdf-task footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.pdf-task p{margin:7px 0;color:#172033}.status{padding:3px 7px;border-radius:999px;font-size:7pt;font-weight:800}.status-open{color:#b54708;background:#fff4e5}.status-in_progress{color:#175cd3;background:#eff8ff}.status-completed{color:#087c4c;background:#ecfdf3}.pdf-task-assignment{margin-bottom:6px;color:#344054;font-size:8pt}.pdf-task footer{border-top:1px solid #e6e9ef;padding-top:6px;color:#667085;font-size:7.5pt}.pdf-task small{display:block;margin-top:5px;color:#087c4c}.pdf-empty{break-inside:avoid;padding:14px;border:1px dashed #cfd5df;border-radius:10px;color:#667085}.pdf-footer{border-top:1px solid #dfe3ea;margin-top:16px;padding-top:8px;color:#7a8497;font-size:8pt}@media print{.print-button{display:none}}
  </style></head><body><button class="print-button" onclick="window.print()">Save as PDF</button><header class="pdf-heading"><div class="brand"><span class="brand-mark">L&amp;A</span><div><strong>Construction Manager</strong><small>Task Manager</small></div></div><div><h1>Tasks</h1><span>${escapeHtml(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))}</span></div></header><section class="pdf-summary"><div><span>Open work</span><strong>${open.length}</strong></div><div><span>Materials to order</span><strong>${materials.length}</strong></div><div><span>Completed</span><strong>${completed.length}</strong></div></section>${body}<footer class="pdf-footer">Generated from L&amp;A Construction Manager</footer><script>setTimeout(()=>{window.focus();window.print()},350)<\/script></body></html>`);
  printWindow.document.close();
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
  const pdfButton = document.querySelector("#tasksPdfButton");
  let rows = [];
  let tasks = [];
  let manualTasks = [];
  let taskOverrides = {};
  let members = [];
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
    workList.innerHTML = sortTasks(open).map((task) => renderTask(task, canManage, members)).join("") || '<p class="tasks-empty">No open work tasks were found.</p>';
    materialList.innerHTML = sortTasks(materials).map((task) => renderTask(task, canManage, members)).join("") || '<p class="tasks-empty">No materials need to be ordered.</p>';
    completedList.innerHTML = sortTasks(completed).map((task) => renderTask(task, canManage, members)).join("") || '<p class="tasks-empty">No completed tasks were found.</p>';
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
    members = memberResult.data || [];
    readControls();
    tasks = buildTaskHistory(rows);
    projectSelect.innerHTML = '<option value="General">General / no project</option>' + (projectResult.data || []).map((project) => `<option value="${escapeHtml(project.name)}">${escapeHtml(project.name)}</option>`).join("");
    assigneeSelect.innerHTML = assigneeOptions("", members);
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
    const select = event.target.closest(".task-status-select, .task-assignee-select");
    if (!select || !canManage) return;
    const id = select.closest(".ai-task-card")?.dataset.taskId;
    if (!id) return;
    select.disabled = true;
    try {
      const field = select.classList.contains("task-status-select") ? "status" : "assigned_to";
      taskOverrides[id] = { ...(taskOverrides[id] || {}), [field]: select.value, updated_at: new Date().toISOString() };
      await persistControls();
      showMessage(field === "status" ? "Task status updated." : "Task assignment updated.");
      await load();
    } catch { showMessage("The task status could not be saved.", true); select.disabled = false; }
  });

  pdfButton.addEventListener("click", () => {
    try { printTasksPdf(tasks); }
    catch (error) { showMessage(error.message || "The tasks PDF could not be opened.", true); }
  });

  return { load };
}
