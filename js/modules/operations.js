function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
function today() { return new Date().toLocaleDateString("en-CA"); }
function formatDate(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date"; }
function projectName(projects, id) { return projects.find((project) => project.id === id)?.name || "General"; }
function projectOptions(projects, selected = "") { return '<option value="">General / no project</option>' + projects.map((project) => `<option value="${project.id}"${project.id === selected ? " selected" : ""}>${escapeHtml(project.name)}</option>`).join(""); }
function memberOptions(members, selected = "") { return '<option value="">Unassigned</option>' + members.map((member) => `<option value="${member.user_id}"${member.user_id === selected ? " selected" : ""}>${escapeHtml(member.full_name || member.email || "Unnamed user")}</option>`).join(""); }
function showMessage(element, text, error = false) { element.textContent = text; element.classList.toggle("message-error", error); element.hidden = false; }
function hideMessage(element) { element.hidden = true; }
function parseJson(value) { try { return JSON.parse(value); } catch { return null; } }
function datedValue(value) {
  const text = String(value || "");
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  return us ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : null;
}
async function loadReferences(supabase, companyId) {
  const [projectResult, memberResult] = await Promise.all([
    supabase.from("projects").select("id,name,address").eq("company_id", companyId).order("name"),
    supabase.from("company_members").select("user_id,full_name,email").eq("company_id", companyId).eq("is_active", true).order("full_name"),
  ]);
  if (projectResult.error || memberResult.error) throw new Error("Projects or team members could not be loaded.");
  return { projects: projectResult.data || [], members: memberResult.data || [] };
}

export function createScheduleModule({ supabase, companyId, canManage }) {
  const form = document.querySelector("#scheduleForm");
  const message = document.querySelector("#scheduleMessage");
  const list = document.querySelector("#scheduleList");
  const projectSelect = document.querySelector("#scheduleProject");
  const assigneeSelect = document.querySelector("#scheduleAssignee");
  let projects = [];
  let members = [];
  document.querySelector("#scheduleFormCard").hidden = !canManage;
  document.querySelector("#scheduleDate").value = today();

  async function load() {
    hideMessage(message);
    try {
      ({ projects, members } = await loadReferences(supabase, companyId));
      projectSelect.innerHTML = projectOptions(projects);
      assigneeSelect.innerHTML = memberOptions(members);
      const [eventResult, taskResult, inspectionResult] = await Promise.all([
        supabase.from("schedule_events").select("*").eq("company_id", companyId).order("event_date").limit(250),
        supabase.from("work_tasks").select("id,project_id,details,due_date,status,assigned_name").eq("company_id", companyId).not("due_date", "is", null).not("status", "in", '(completed,cancelled)').order("due_date"),
        supabase.from("inspections").select("id,project_id,inspection_type,scheduled_date,scheduled_time,status").eq("company_id", companyId).order("scheduled_date"),
      ]);
      if (eventResult.error || taskResult.error || inspectionResult.error) throw new Error("Calendar information could not be loaded.");
      const entries = [
        ...(eventResult.data || []).map((item) => ({ ...item, date: item.event_date, title: item.title, type: item.event_type, source: "event" })),
        ...(taskResult.data || []).map((item) => ({ ...item, date: item.due_date, title: item.details, type: "task", source: "task" })),
        ...(inspectionResult.data || []).map((item) => ({ ...item, date: item.scheduled_date, title: item.inspection_type, type: "inspection", source: "inspection" })),
      ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      list.innerHTML = entries.length ? entries.map((item) => `<article class="operation-row ${item.date < today() && !["completed", "passed", "cancelled"].includes(item.status) ? "is-overdue" : ""}"><time>${escapeHtml(formatDate(item.date))}${item.start_time || item.scheduled_time ? `<small>${escapeHtml(String(item.start_time || item.scheduled_time).slice(0, 5))}</small>` : ""}</time><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(projectName(projects, item.project_id))} · ${escapeHtml(item.type)}</span></div>${canManage && item.source === "event" ? `<select class="calendar-status" data-event-id="${item.id}"><option value="scheduled"${item.status === "scheduled" ? " selected" : ""}>Scheduled</option><option value="completed"${item.status === "completed" ? " selected" : ""}>Completed</option><option value="cancelled"${item.status === "cancelled" ? " selected" : ""}>Cancelled</option></select>` : `<em class="operation-status">${escapeHtml(item.status || "scheduled")}</em>`}</article>`).join("") : '<p class="tasks-empty">No calendar items were found.</p>';
      list.querySelectorAll(".calendar-status").forEach((select) => select.addEventListener("change", async () => { select.disabled = true; const { error } = await supabase.from("schedule_events").update({ status: select.value }).eq("id", select.dataset.eventId); if (error) showMessage(message, "Calendar status could not be updated.", true); else { showMessage(message, "Calendar status updated."); await load(); } }));
    } catch (error) { showMessage(message, error.message, true); }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button"); button.disabled = true;
    const assignedTo = assigneeSelect.value || null;
    const assigned = members.find((member) => member.user_id === assignedTo);
    const { error } = await supabase.from("schedule_events").insert({ company_id: companyId, project_id: projectSelect.value || null, title: document.querySelector("#scheduleTitleInput").value.trim(), event_type: document.querySelector("#scheduleType").value, event_date: document.querySelector("#scheduleDate").value, start_time: document.querySelector("#scheduleTime").value || null, assigned_to: assignedTo, assigned_name: assigned?.full_name || assigned?.email || null, notes: document.querySelector("#scheduleNotes").value.trim() || null });
    button.disabled = false;
    if (error) return showMessage(message, `Calendar item could not be saved: ${error.message}`, true);
    form.reset(); document.querySelector("#scheduleDate").value = today(); showMessage(message, "Calendar item added."); await load();
  });
  return { load };
}

export function createMaterialsModule({ supabase, companyId, canManage }) {
  const form = document.querySelector("#materialForm");
  const message = document.querySelector("#materialsMessage");
  const list = document.querySelector("#materialsList");
  const projectSelect = document.querySelector("#materialProject");
  let projects = [];
  document.querySelector("#materialFormCard").hidden = !canManage;
  document.querySelector("#materialNeededBy").value = today();

  async function load() {
    hideMessage(message);
    try {
      ({ projects } = await loadReferences(supabase, companyId));
      projectSelect.innerHTML = projectOptions(projects);
      const [orderResult, taskResult] = await Promise.all([
        supabase.from("material_orders").select("*").eq("company_id", companyId).order("needed_by", { ascending: true, nullsFirst: false }),
        supabase.from("work_tasks").select("id,project_id,details,due_date,status").eq("company_id", companyId).eq("task_type", "material").not("status", "in", '(completed,cancelled)').order("due_date", { ascending: true, nullsFirst: false }),
      ]);
      if (orderResult.error || taskResult.error) throw new Error("Materials could not be loaded.");
      const missingOrders = (taskResult.data || []).filter((task) => !(orderResult.data || []).some((order) => order.task_id === task.id));
      if (canManage && missingOrders.length) {
        const linked = await supabase.from("material_orders").upsert(missingOrders.map((task) => ({ company_id: companyId, project_id: task.project_id, task_id: task.id, item_name: task.details, needed_by: task.due_date, status: "needed", notes: "Created from the independent Task Manager." })), { onConflict: "task_id", ignoreDuplicates: true });
        if (linked.error) throw linked.error;
      }
      const refreshedOrders = canManage && missingOrders.length ? await supabase.from("material_orders").select("*").eq("company_id", companyId).order("needed_by", { ascending: true, nullsFirst: false }) : orderResult;
      if (refreshedOrders.error) throw refreshedOrders.error;
      const rows = [...(refreshedOrders.data || []), ...(!canManage ? missingOrders.map((task) => ({ ...task, item_name: task.details, needed_by: task.due_date, status: "needed", from_task: true })) : [])];
      list.innerHTML = rows.length ? rows.map((item) => `<article class="management-card"><header><div><strong>${escapeHtml(item.item_name)}</strong><small>${escapeHtml(projectName(projects, item.project_id))}</small></div>${item.from_task ? '<span class="source-badge">From Tasks</span>' : (canManage ? `<select class="material-status" data-material-id="${item.id}" data-task-id="${item.task_id || ""}"><option value="needed"${item.status === "needed" ? " selected" : ""}>Needed</option><option value="ordered"${item.status === "ordered" ? " selected" : ""}>Ordered</option><option value="delivered"${item.status === "delivered" ? " selected" : ""}>Delivered</option><option value="cancelled"${item.status === "cancelled" ? " selected" : ""}>Cancelled</option></select>` : `<span class="source-badge">${escapeHtml(item.status)}</span>`)}</header><p>${escapeHtml([item.quantity, item.vendor, item.order_number].filter(Boolean).join(" · ") || "No purchasing details yet")}</p><small>${item.needed_by ? `Needed by ${escapeHtml(formatDate(item.needed_by))}` : "No needed-by date"}</small></article>`).join("") : '<p class="tasks-empty">No material orders were found.</p>';
      list.querySelectorAll(".material-status").forEach((select) => select.addEventListener("change", async () => {
        select.disabled = true; const { error } = await supabase.from("material_orders").update({ status: select.value }).eq("id", select.dataset.materialId); if (error) return showMessage(message, "Material status could not be updated.", true);
        if (select.dataset.taskId) {
          const taskStatus = select.value === "delivered" ? "completed" : select.value === "cancelled" ? "cancelled" : select.value === "ordered" ? "in_progress" : "open";
          const linkedTask = await supabase.from("work_tasks").update({ status: taskStatus, completed_at: taskStatus === "completed" ? new Date().toISOString() : null }).eq("id", select.dataset.taskId);
          if (linkedTask.error) return showMessage(message, "Material changed, but its linked task could not be updated.", true);
        }
        showMessage(message, "Material and linked task updated."); await load();
      }));
    } catch (error) { showMessage(message, error.message, true); }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
    const status = document.querySelector("#materialStatus").value; const itemName = document.querySelector("#materialName").value.trim(); const neededBy = document.querySelector("#materialNeededBy").value || null;
    const taskInsert = await supabase.from("work_tasks").insert({ company_id: companyId, project_id: projectSelect.value || null, details: itemName, task_type: "material", status: status === "delivered" ? "completed" : status === "ordered" ? "in_progress" : "open", due_date: neededBy, source_date: today(), source: "material_manager", completed_at: status === "delivered" ? new Date().toISOString() : null }).select("id").single();
    const { error } = taskInsert.error ? taskInsert : await supabase.from("material_orders").insert({ company_id: companyId, project_id: projectSelect.value || null, task_id: taskInsert.data.id, item_name: itemName, quantity: document.querySelector("#materialQuantity").value.trim() || null, vendor: document.querySelector("#materialVendor").value.trim() || null, needed_by: neededBy, status, notes: document.querySelector("#materialNotes").value.trim() || null });
    button.disabled = false; if (error) return showMessage(message, `Material could not be saved: ${error.message}`, true); form.reset(); document.querySelector("#materialNeededBy").value = today(); showMessage(message, "Material added."); await load();
  });
  return { load };
}

export function createInspectionsModule({ supabase, companyId, canManage }) {
  const form = document.querySelector("#inspectionForm");
  const message = document.querySelector("#inspectionsMessage");
  const list = document.querySelector("#inspectionsList");
  const projectSelect = document.querySelector("#inspectionProject");
  const monthInput = document.querySelector("#inspectionMonth");
  let projects = [];
  document.querySelector("#inspectionFormCard").hidden = !canManage;
  monthInput.value = today().slice(0, 7);
  document.querySelector("#inspectionDate").value = today();

  async function importScheduledInspections() {
    if (!canManage) return;
    const { data: reports, error } = await supabase.from("daily_reports").select("id,project_id,report_date,english_summary").eq("company_id", companyId).order("report_date");
    if (error) throw error;
    const rows = (reports || []).flatMap((report) => {
      const structured = parseJson(report.english_summary) || {};
      return (Array.isArray(structured.inspection) ? structured.inspection : []).map((details, index) => ({ details: String(details || "").trim(), index })).filter(({ details }) => {
        const scheduledDate = datedValue(details);
        return scheduledDate && scheduledDate > report.report_date;
      }).map(({ details, index }) => ({
        company_id: companyId,
        project_id: report.project_id || null,
        inspection_type: details,
        scheduled_date: datedValue(details),
        status: "scheduled",
        notes: "Imported safely from a daily report. The original report was preserved.",
        legacy_key: `report:${report.id}:${index}`,
      }));
    });
    if (!rows.length) return;
    const imported = await supabase.from("inspections").upsert(rows, { onConflict: "company_id,legacy_key", ignoreDuplicates: true });
    if (imported.error) throw imported.error;
  }

  async function load() {
    hideMessage(message);
    try {
      ({ projects } = await loadReferences(supabase, companyId));
      projectSelect.innerHTML = projectOptions(projects);
      await importScheduledInspections();
      const month = monthInput.value || today().slice(0, 7);
      const start = `${month}-01`; const endDate = new Date(`${start}T12:00:00`); endDate.setMonth(endDate.getMonth() + 1); const end = endDate.toLocaleDateString("en-CA");
      const { data, error } = await supabase.from("inspections").select("*").eq("company_id", companyId).gte("scheduled_date", start).lt("scheduled_date", end).order("scheduled_date").order("scheduled_time");
      if (error) throw new Error("Inspection calendar could not be loaded.");
      list.innerHTML = (data || []).length ? data.map((item) => `<article class="inspection-card"><div class="calendar-date"><strong>${escapeHtml(String(Number(item.scheduled_date.slice(-2))))}</strong><span>${escapeHtml(new Date(`${item.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }))}</span></div><div><strong>${escapeHtml(item.inspection_type)}</strong><p>${escapeHtml(projectName(projects, item.project_id))}${item.inspector ? ` · ${escapeHtml(item.inspector)}` : ""}${item.scheduled_time ? ` · ${escapeHtml(item.scheduled_time.slice(0, 5))}` : ""}</p>${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ""}</div>${canManage ? `<select class="inspection-status" data-inspection-id="${item.id}"><option value="scheduled"${item.status === "scheduled" ? " selected" : ""}>Scheduled</option><option value="passed"${item.status === "passed" ? " selected" : ""}>Passed</option><option value="failed"${item.status === "failed" ? " selected" : ""}>Failed</option><option value="cancelled"${item.status === "cancelled" ? " selected" : ""}>Cancelled</option></select>` : `<span class="source-badge">${escapeHtml(item.status)}</span>`}</article>`).join("") : '<p class="tasks-empty">No inspections are scheduled for this month.</p>';
      list.querySelectorAll(".inspection-status").forEach((select) => select.addEventListener("change", async () => { select.disabled = true; const { error } = await supabase.from("inspections").update({ status: select.value }).eq("id", select.dataset.inspectionId); if (error) showMessage(message, "Inspection status could not be updated.", true); else { showMessage(message, "Inspection status updated."); await load(); } }));
    } catch (error) { showMessage(message, error.message, true); }
  }
  monthInput.addEventListener("change", load);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
    const date = document.querySelector("#inspectionDate").value;
    const { error } = await supabase.from("inspections").insert({ company_id: companyId, project_id: projectSelect.value || null, inspection_type: document.querySelector("#inspectionType").value.trim(), scheduled_date: date, scheduled_time: document.querySelector("#inspectionTime").value || null, inspector: document.querySelector("#inspectionInspector").value.trim() || null, status: "scheduled", notes: document.querySelector("#inspectionNotes").value.trim() || null });
    button.disabled = false; if (error) return showMessage(message, `Inspection could not be saved: ${error.message}`, true); form.reset(); document.querySelector("#inspectionDate").value = date; monthInput.value = date.slice(0, 7); showMessage(message, "Inspection scheduled."); await load();
  });
  return { load };
}

export function createLaborModule({ supabase, session, companyId, canManage }) {
  const form = document.querySelector("#laborForm");
  const message = document.querySelector("#laborMessage");
  const list = document.querySelector("#laborList");
  const projectSelect = document.querySelector("#laborProject");
  const memberSelect = document.querySelector("#laborEmployee");
  const dateFilter = document.querySelector("#laborDateFilter");
  let projects = [];
  let members = [];
  dateFilter.value = today();
  document.querySelector("#laborDate").value = today();

  async function load() {
    hideMessage(message);
    try {
      ({ projects, members } = await loadReferences(supabase, companyId));
      projectSelect.innerHTML = projectOptions(projects);
      memberSelect.innerHTML = members.map((member) => `<option value="${member.user_id}"${!canManage && member.user_id === session.user.id ? " selected" : ""}>${escapeHtml(member.full_name || member.email)}</option>`).join("");
      memberSelect.disabled = !canManage;
      const { data, error } = await supabase.from("labor_entries").select("*").eq("company_id", companyId).eq("work_date", dateFilter.value).order("employee_name");
      if (error) throw new Error("Labor entries could not be loaded.");
      const total = (data || []).reduce((sum, item) => sum + Number(item.hours || 0), 0);
      document.querySelector("#laborTotal").textContent = `${total.toFixed(1)} hours`;
      list.innerHTML = (data || []).length ? data.map((item) => `<article class="operation-row"><time>${escapeHtml(String(item.hours))}<small>hours</small></time><div><strong>${escapeHtml(item.employee_name)}</strong><span>${escapeHtml(projectName(projects, item.project_id))}${item.trade ? ` · ${escapeHtml(item.trade)}` : ""}</span>${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}</div></article>`).join("") : '<p class="tasks-empty">No labor has been entered for this date.</p>';
    } catch (error) { showMessage(message, error.message, true); }
  }
  dateFilter.addEventListener("change", load);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
    const memberId = canManage ? memberSelect.value : session.user.id;
    const member = members.find((item) => item.user_id === memberId);
    const workDate = document.querySelector("#laborDate").value;
    const { error } = await supabase.from("labor_entries").insert({ company_id: companyId, project_id: projectSelect.value || null, member_id: memberId, employee_name: member?.full_name || member?.email || session.user.email, work_date: workDate, hours: Number(document.querySelector("#laborHours").value), trade: document.querySelector("#laborTrade").value.trim() || null, notes: document.querySelector("#laborNotes").value.trim() || null });
    button.disabled = false; if (error) return showMessage(message, `Labor could not be saved: ${error.message}`, true); form.reset(); document.querySelector("#laborDate").value = workDate; dateFilter.value = workDate; showMessage(message, "Labor entry saved."); await load();
  });
  return { load };
}

export function createSubcontractorsModule({ supabase, companyId, canManage }) {
  const form = document.querySelector("#subcontractorForm");
  const message = document.querySelector("#subcontractorsMessage");
  const list = document.querySelector("#subcontractorsList");
  document.querySelector("#subcontractorFormCard").hidden = !canManage;
  async function load() {
    hideMessage(message);
    const { data, error } = await supabase.from("subcontractors").select("*").eq("company_id", companyId).order("company_name");
    if (error) return showMessage(message, "Subcontractors could not be loaded.", true);
    list.innerHTML = (data || []).length ? data.map((item) => `<article class="management-card"><header><div><strong>${escapeHtml(item.company_name)}</strong><small>${escapeHtml(item.trade || "Trade not specified")}</small></div><span class="source-badge">${escapeHtml(item.status)}</span></header><p>${escapeHtml([item.contact_name, item.phone, item.email].filter(Boolean).join(" · ") || "No contact details")}</p><small>${item.insurance_expiry ? `Insurance expires ${escapeHtml(formatDate(item.insurance_expiry))}` : "Insurance date not entered"}</small></article>`).join("") : '<p class="tasks-empty">No subcontractors have been added.</p>';
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
    const { error } = await supabase.from("subcontractors").insert({ company_id: companyId, company_name: document.querySelector("#subcontractorCompany").value.trim(), contact_name: document.querySelector("#subcontractorContact").value.trim() || null, trade: document.querySelector("#subcontractorTrade").value.trim() || null, phone: document.querySelector("#subcontractorPhone").value.trim() || null, email: document.querySelector("#subcontractorEmail").value.trim() || null, insurance_expiry: document.querySelector("#subcontractorInsurance").value || null, notes: document.querySelector("#subcontractorNotes").value.trim() || null });
    button.disabled = false; if (error) return showMessage(message, `Subcontractor could not be saved: ${error.message}`, true); form.reset(); showMessage(message, "Subcontractor added."); await load();
  });
  return { load };
}

export function createFilesModule({ supabase, companyId, canManage }) {
  const form = document.querySelector("#libraryUploadForm");
  const message = document.querySelector("#filesMessage");
  const list = document.querySelector("#filesLibraryList");
  const projectSelect = document.querySelector("#libraryProject");
  let projects = [];
  document.querySelector("#libraryUploadCard").hidden = !canManage;
  document.querySelector("#libraryDate").value = today();
  async function load() {
    hideMessage(message);
    try {
      ({ projects } = await loadReferences(supabase, companyId)); projectSelect.innerHTML = projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("");
      if (!projects.length) { list.innerHTML = '<p class="tasks-empty">Create a project before uploading files.</p>'; form.querySelector("button").disabled = true; return; }
      form.querySelector("button").disabled = false;
      const { data, error } = await supabase.from("project_files").select("*").in("project_id", projects.map((project) => project.id)).order("created_at", { ascending: false });
      if (error) throw new Error("Files could not be loaded.");
      list.innerHTML = (data || []).length ? data.map((file) => `<article class="management-card file-library-card"><header><div><strong>${escapeHtml(file.file_name)}</strong><small>${escapeHtml(projectName(projects, file.project_id))} · ${escapeHtml(file.category || "documents")}</small></div><button class="secondary-button open-library-file" data-file-id="${file.id}" type="button">Open</button></header>${file.description ? `<p>${escapeHtml(file.description)}</p>` : ""}<small>${escapeHtml(file.document_date ? formatDate(file.document_date) : new Date(file.created_at).toLocaleDateString())}${file.location ? ` · ${escapeHtml(file.location)}` : ""} · ${(Number(file.file_size || 0) / 1048576).toFixed(1)} MB</small></article>`).join("") : '<p class="tasks-empty">No photos, plans, or documents were found.</p>';
      list.querySelectorAll(".open-library-file").forEach((button) => button.addEventListener("click", async () => { const file = (data || []).find((item) => item.id === button.dataset.fileId); const tab = window.open("", "_blank"); const signed = await supabase.storage.from("project-files").createSignedUrl(file.storage_path, 300); if (signed.error || !signed.data?.signedUrl) { tab?.close(); showMessage(message, "File could not be opened.", true); } else if (tab) tab.location = signed.data.signedUrl; else window.location.href = signed.data.signedUrl; }));
    } catch (error) { showMessage(message, error.message, true); }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = form.querySelector("button"); const files = [...document.querySelector("#libraryFiles").files]; if (!files.length) return; button.disabled = true;
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { button.disabled = false; return showMessage(message, `${file.name} is larger than 50 MB.`, true); }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-"); const id = globalThis.crypto.randomUUID(); const path = `${companyId}/${projectSelect.value}/${id}-${safeName}`;
      const upload = await supabase.storage.from("project-files").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upload.error) { button.disabled = false; return showMessage(message, `${file.name} could not be uploaded.`, true); }
      const metadata = await supabase.from("project_files").insert({ project_id: projectSelect.value, storage_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size, category: document.querySelector("#libraryCategory").value, description: document.querySelector("#libraryDescription").value.trim() || null, document_date: document.querySelector("#libraryDate").value || null, location: document.querySelector("#libraryLocation").value.trim() || null });
      if (metadata.error) { await supabase.storage.from("project-files").remove([path]); button.disabled = false; return showMessage(message, `${file.name} could not be saved.`, true); }
    }
    button.disabled = false; form.reset(); document.querySelector("#libraryDate").value = today(); showMessage(message, "Files uploaded."); await load();
  });
  return { load };
}

export function createAlertsModule({ supabase, companyId }) {
  const message = document.querySelector("#alertsMessage");
  const list = document.querySelector("#alertsList");
  async function load() {
    hideMessage(message);
    try {
      const inSevenDays = new Date(); inSevenDays.setDate(inSevenDays.getDate() + 7); const soon = inSevenDays.toLocaleDateString("en-CA");
      const inThirtyDays = new Date(); inThirtyDays.setDate(inThirtyDays.getDate() + 30); const insuranceSoon = inThirtyDays.toLocaleDateString("en-CA");
      const [taskResult, materialResult, inspectionResult, subcontractorResult, references] = await Promise.all([
      supabase.from("work_tasks").select("project_id,details,due_date,status").eq("company_id", companyId).lt("due_date", today()).not("status", "in", '(completed,cancelled)'),
      supabase.from("material_orders").select("project_id,item_name,needed_by,status").eq("company_id", companyId).lt("needed_by", today()).in("status", ["needed", "ordered"]),
      supabase.from("inspections").select("project_id,inspection_type,scheduled_date,status").eq("company_id", companyId).gte("scheduled_date", today()).lte("scheduled_date", soon).eq("status", "scheduled"),
      supabase.from("subcontractors").select("company_name,insurance_expiry,status").eq("company_id", companyId).eq("status", "active").lte("insurance_expiry", insuranceSoon),
      loadReferences(supabase, companyId),
      ]);
      if (taskResult.error || materialResult.error || inspectionResult.error || subcontractorResult.error) return showMessage(message, "Alerts will appear after the operations database is activated.", true);
      const projects = references.projects;
      const alerts = [
      ...(taskResult.data || []).map((item) => ({ level: "urgent", title: "Overdue task", details: item.details, project: projectName(projects, item.project_id), date: item.due_date })),
      ...(materialResult.data || []).map((item) => ({ level: "urgent", title: "Material is late", details: item.item_name, project: projectName(projects, item.project_id), date: item.needed_by })),
      ...(inspectionResult.data || []).map((item) => ({ level: "notice", title: "Upcoming inspection", details: item.inspection_type, project: projectName(projects, item.project_id), date: item.scheduled_date })),
      ...(subcontractorResult.data || []).map((item) => ({ level: "notice", title: "Insurance expiration", details: item.company_name, project: "Subcontractor", date: item.insurance_expiry })),
      ];
      document.querySelector("#alertCount").textContent = String(alerts.length);
      list.innerHTML = alerts.length ? alerts.map((alert) => `<article class="alert-card alert-${alert.level}"><span aria-hidden="true">${alert.level === "urgent" ? "!" : "i"}</span><div><strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.details)}</p><small>${escapeHtml(alert.project)} · ${escapeHtml(formatDate(alert.date))}</small></div></article>`).join("") : '<p class="tasks-empty">No urgent alerts. Everything requiring a date is on track.</p>';
    } catch (error) { showMessage(message, error.message || "Alerts could not be loaded.", true); }
  }
  return { load };
}
