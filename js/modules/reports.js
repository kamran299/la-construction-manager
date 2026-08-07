function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }
function today() { return new Date().toLocaleDateString("en-CA"); }

function parseDailySummary(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function renderAnalysisItems(title, items, emptyText) {
  const rows = Array.isArray(items) ? items : [];
  return `<section class="analysis-section"><h3>${escapeHtml(title)}</h3>${rows.length ? `<ul>${rows.map((item) => `<li><div><strong>${escapeHtml(item.project || "General")}</strong><p>${escapeHtml(item.details)}</p></div><small>Reported by ${escapeHtml((item.reported_by || []).join(", ") || "Unknown")}</small></li>`).join("")}</ul>` : `<p class="analysis-empty">${escapeHtml(emptyText)}</p>`}</section>`;
}

function renderDailySummary(value) {
  const analysis = parseDailySummary(value);
  if (!analysis) return `<h2>End-of-day summary</h2><p>${escapeHtml(value)}</p>`;
  const contributors = Array.isArray(analysis.contributors) ? analysis.contributors : [];
  return `<header class="analysis-header"><div><span>AI DAILY ANALYSIS</span><h2>End-of-day management report</h2></div><strong>${contributors.length} contributor${contributors.length === 1 ? "" : "s"}</strong></header>
    <section class="analysis-overview"><h3>Executive summary</h3><p>${escapeHtml(analysis.executive_summary || "No overall conclusion was available.")}</p></section>
    ${renderAnalysisItems("Work completed", analysis.completed_work, "No completed work was reported.")}
    ${renderAnalysisItems("Blockers and delays", analysis.blockers_and_delays, "No blockers or delays were reported.")}
    ${renderAnalysisItems("Safety", analysis.safety, "No safety observations were reported.")}
    ${renderAnalysisItems("Tomorrow's plan", analysis.tomorrow_plan, "No work for tomorrow was reported.")}
    <section class="analysis-section analysis-contributors"><h3>Reports included</h3>${contributors.length ? `<ul>${contributors.map((person) => `<li><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml((person.projects || []).join(", ") || "General")}</small></li>`).join("")}</ul>` : `<p class="analysis-empty">No contributors were listed.</p>`}</section>`;
}

function formatReportDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function printableReport(report, project, metaLabel, metaValue) {
  return `<article class="pdf-report"><header><div><h3>${escapeHtml(report.reporter_name || "Unknown")}</h3><small>${escapeHtml(report.reporter_email || "")}</small></div><span>${escapeHtml(metaValue || "General")}</span></header><p>${escapeHtml(report.english_text || "No report details were provided.")}</p>${report.english_summary ? `<aside><strong>Quick note</strong>${escapeHtml(report.english_summary)}</aside>` : ""}<footer>${escapeHtml(metaLabel)}: ${escapeHtml(metaValue || project?.name || "General")}</footer></article>`;
}

function openPdfPrintView({ title, subtitle, body }) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Please allow pop-ups so the PDF can open.");
  printWindow.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    @page{size:letter;margin:.55in}*{box-sizing:border-box}body{margin:0;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:10.5pt;line-height:1.5}button{position:fixed;right:18px;top:18px;border:0;border-radius:9px;background:#e96614;color:#fff;padding:11px 16px;font-weight:800;cursor:pointer}.pdf-heading{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #e96614;padding-bottom:18px;margin-bottom:24px}.brand{display:flex;align-items:center;gap:12px}.brand-mark{display:grid;place-items:center;width:48px;height:48px;border:2px solid #e96614;border-radius:12px;font-weight:900}.brand strong{display:block;font-size:16pt}.brand small,.pdf-heading>div:last-child{color:#667085}.pdf-heading>div:last-child{text-align:right}.pdf-heading h1{font-size:21pt;margin:4px 0}.pdf-group{break-inside:avoid-page;margin:0 0 26px}.pdf-group>header{display:flex;justify-content:space-between;gap:16px;align-items:end;background:#152238;color:#fff;border-radius:12px;padding:13px 16px;margin-bottom:10px}.pdf-group h2{font-size:15pt;margin:0}.pdf-group header small{color:#d8deea}.pdf-report{break-inside:avoid;border:1px solid #dfe3ea;border-radius:12px;padding:14px 16px;margin:0 0 10px}.pdf-report header{display:flex;justify-content:space-between;gap:15px;border-bottom:1px solid #e6e9ef;padding-bottom:8px}.pdf-report h3{margin:0;font-size:11.5pt}.pdf-report header small{color:#667085}.pdf-report header span{background:#fff2e9;color:#c95108;border-radius:999px;padding:4px 9px;font-size:8.5pt;font-weight:800}.pdf-report p{white-space:pre-wrap;margin:12px 0}.pdf-report aside{background:#f5f7fa;border-left:3px solid #e96614;padding:8px 10px;color:#4b5563}.pdf-report aside strong{margin-right:7px;color:#111827}.pdf-report footer{margin-top:9px;color:#7a8497;font-size:8.5pt}.analysis-header{display:flex;justify-content:space-between;gap:20px}.analysis-header span{color:#e96614;font-weight:800;letter-spacing:.12em}.analysis-header h2{font-size:18pt;margin:3px 0}.analysis-overview,.analysis-section{break-inside:avoid;border:1px solid #dfe3ea;border-radius:12px;padding:14px 16px;margin-bottom:12px}.analysis-overview h3,.analysis-section h3{margin:0 0 7px}.analysis-overview p,.analysis-section p{margin:0}.analysis-section ul{list-style:none;margin:0;padding:0}.analysis-section li{display:flex;justify-content:space-between;gap:18px;border-top:1px solid #e6e9ef;padding:9px 0}.analysis-section li:first-child{border-top:0}.analysis-section li small{color:#667085}.analysis-empty{color:#7a8497}.pdf-empty{padding:30px;border:1px dashed #cfd5df;border-radius:12px;text-align:center;color:#667085}.pdf-footer{border-top:1px solid #dfe3ea;margin-top:24px;padding-top:10px;color:#7a8497;font-size:8.5pt}@media print{button{display:none}}
  </style></head><body><button onclick="window.print()">Save as PDF</button><header class="pdf-heading"><div class="brand"><span class="brand-mark">L&amp;A</span><div><strong>Construction Manager</strong><small>Daily field reporting</small></div></div><div><h1>${escapeHtml(title)}</h1><span>${escapeHtml(subtitle)}</span></div></header>${body}<footer class="pdf-footer">Generated from L&amp;A Construction Manager</footer><script>setTimeout(()=>{window.focus();window.print()},350)<\/script></body></html>`);
  printWindow.document.close();
}

export function createReportsModule({ supabase, session, companyId, membership, canManage }) {
  const form = document.querySelector("#reportForm");
  const list = document.querySelector("#reportsList");
  const message = document.querySelector("#reportsMessage");
  const reportDate = document.querySelector("#reportDate");
  const filterDate = document.querySelector("#reportsDateFilter");
  const projectSelect = document.querySelector("#reportProject");
  const summary = document.querySelector("#dailySummary");
  const summaryButton = document.querySelector("#summarizeReportsButton");
  const reportText = document.querySelector("#reportText");
  const recordButton = document.querySelector("#recordReportButton");
  const recordingStatus = document.querySelector("#recordingStatus");
  const employeePdfButton = document.querySelector("#employeeReportsPdfButton");
  const projectPdfButton = document.querySelector("#projectReportsPdfButton");
  const summaryPdfButton = document.querySelector("#summaryPdfButton");
  reportDate.value = filterDate.value = today();
  summaryButton.hidden = !canManage;
  let projects = [];
  let reports = [];
  let recorder = null;
  let microphoneStream = null;
  let audioChunks = [];
  let savedSummaryValue = "";

  function projectFor(report) { return projects.find((project) => project.id === report.project_id); }

  function setPdfAvailability() {
    employeePdfButton.disabled = !reports.length;
    projectPdfButton.disabled = !reports.length;
    summaryPdfButton.disabled = !savedSummaryValue;
  }

  function showPdfError(error) {
    message.textContent = error.message || "The PDF could not be opened.";
    message.classList.add("message-error");
    message.hidden = false;
  }

  function exportGroupedPdf(groupBy) {
    try {
      const groups = new Map();
      reports.forEach((report) => {
        const project = projectFor(report);
        const isEmployee = groupBy === "employee";
        const key = isEmployee ? (report.reporter_id || report.reporter_email || report.reporter_name) : (report.project_id || "general");
        const current = groups.get(key) || { title: isEmployee ? (report.reporter_name || "Unknown") : (project?.name || "General / no project"), subtitle: isEmployee ? (report.reporter_email || "") : (project?.address || ""), reports: [] };
        current.reports.push({ report, project });
        groups.set(key, current);
      });
      const body = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title)).map((group) => `<section class="pdf-group"><header><div><h2>${escapeHtml(group.title)}</h2><small>${escapeHtml(group.subtitle)}</small></div><strong>${group.reports.length} report${group.reports.length === 1 ? "" : "s"}</strong></header>${group.reports.map(({ report, project }) => printableReport(report, project, groupBy === "employee" ? "Project" : "Submitted by", groupBy === "employee" ? (project?.name || "General") : (report.reporter_name || "Unknown"))).join("")}</section>`).join("") || '<div class="pdf-empty">No reports were submitted for this date.</div>';
      openPdfPrintView({ title: groupBy === "employee" ? "Daily reports by employee" : "Daily reports by project", subtitle: formatReportDate(filterDate.value), body });
    } catch (error) { showPdfError(error); }
  }

  function exportSummaryPdf() {
    try {
      if (!savedSummaryValue) throw new Error("Create the AI daily analysis first.");
      openPdfPrintView({ title: "AI end-of-day analysis", subtitle: formatReportDate(filterDate.value), body: renderDailySummary(savedSummaryValue) });
    } catch (error) { showPdfError(error); }
  }

  function setRecordingStatus(text, state = "") {
    recordingStatus.textContent = text;
    recordingStatus.dataset.state = state;
  }

  function stopMicrophone() {
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
  }

  function supportedAudioType() {
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    return types.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  async function transcribeRecording(blob) {
    if (!blob.size) throw new Error("No voice was recorded. Please try again.");
    if (blob.size > 4 * 1024 * 1024) throw new Error("The recording is too long. Please record a shorter report.");
    const formData = new FormData();
    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
    formData.append("audio", blob, `field-report.${extension}`);
    const response = await fetch("/.netlify/functions/report-transcribe", {
      method: "POST",
      headers: { authorization: `Bearer ${session.access_token}` },
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The voice report could not be converted to text.");
    const spokenText = String(data.text || "").trim();
    if (!spokenText) throw new Error("No speech was detected. Please try again.");
    const translated = await callAi({ action: "translate", text: spokenText });
    const englishText = String(translated.english_text || "").trim();
    if (!englishText) throw new Error("The voice report could not be translated to English.");
    reportText.value = [reportText.value.trim(), englishText].filter(Boolean).join("\n");
    reportText.focus();
  }

  async function startRecording() {
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      const mimeType = supportedAudioType();
      recorder = new MediaRecorder(microphoneStream, mimeType ? { mimeType } : undefined);
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size) audioChunks.push(event.data); });
      recorder.addEventListener("stop", async () => {
        const audioType = recorder.mimeType || mimeType || "audio/webm";
        stopMicrophone();
        recordButton.disabled = true;
        recordButton.classList.remove("is-recording");
        recordButton.innerHTML = '<span aria-hidden="true">🎙</span> Start voice report';
        setRecordingStatus("Converting your voice to text...", "working");
        try {
          await transcribeRecording(new Blob(audioChunks, { type: audioType }));
          setRecordingStatus("Voice converted to English. Review it above, then save the report.", "success");
        } catch (error) {
          setRecordingStatus(error.message || "The recording could not be transcribed.", "error");
        } finally {
          recordButton.disabled = false;
          recorder = null;
          audioChunks = [];
        }
      }, { once: true });
      recorder.start(1000);
      recordButton.classList.add("is-recording");
      recordButton.innerHTML = '<span aria-hidden="true">■</span> Stop recording';
      setRecordingStatus("Recording now — speak in Persian or English, then tap Stop.", "recording");
    } catch (error) {
      stopMicrophone();
      setRecordingStatus(error.name === "NotAllowedError" ? "Microphone permission was not allowed. Please allow it and try again." : "The microphone could not be started.", "error");
    }
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    recordButton.disabled = true;
    setRecordingStatus("Voice recording is not supported in this browser. You can still type the report.", "error");
  } else {
    recordButton.addEventListener("click", () => {
      if (recorder?.state === "recording") recorder.stop();
      else startRecording();
    });
  }

  async function callAi(payload) {
    const response = await fetch("/.netlify/functions/report-ai", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "AI service failed");
    return data;
  }

  async function loadProjects() {
    const { data } = await supabase.from("projects").select("id,name,address").eq("company_id", companyId).order("address");
    projects = data || [];
    projectSelect.innerHTML = '<option value="">General / no project</option>' + projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  }

  async function loadReports() {
    message.hidden = true;
    const { data, error } = await supabase.from("daily_reports").select("*").eq("company_id", companyId).eq("report_date", filterDate.value).order("created_at", { ascending: false });
    if (error) { message.textContent = "Reports could not be loaded."; message.hidden = false; return; }
    reports = data || [];
    list.innerHTML = reports.length ? reports.map((r) => {
      const project = projects.find((p) => p.id === r.project_id);
      const canDelete = canManage || r.reporter_id === session.user.id;
      return `<article class="workspace-card report-card"><header><div><strong>${escapeHtml(r.reporter_name)}</strong><small>${escapeHtml(r.reporter_email || "")}</small></div><div class="report-card-actions"><span>${escapeHtml(project?.name || "General")}</span>${canDelete ? `<button class="report-delete-button" type="button" data-delete-report="${r.id}">Delete</button>` : ""}</div></header><div class="report-english report-english-only"><p>${escapeHtml(r.english_text)}</p><small>${escapeHtml(r.english_summary)}</small></div></article>`;
    }).join("") : '<div class="empty-projects">No reports were submitted for this date.</div>';
    list.querySelectorAll("[data-delete-report]").forEach((button) => {
      button.addEventListener("click", () => deleteReport(button.dataset.deleteReport, button));
    });
    const { data: saved } = await supabase.from("daily_report_summaries").select("english_summary").eq("company_id", companyId).eq("report_date", filterDate.value).maybeSingle();
    savedSummaryValue = saved?.english_summary || "";
    summary.hidden = !saved;
    if (saved) summary.innerHTML = renderDailySummary(saved.english_summary);
    setPdfAvailability();
  }

  async function deleteReport(reportId, button) {
    const report = reports.find((item) => item.id === reportId);
    if (!report || !globalThis.confirm("Delete this report permanently?")) return;
    button.disabled = true;
    button.textContent = "Deleting...";
    message.hidden = true;
    const { error } = await supabase.from("daily_reports").delete().eq("id", reportId);
    if (error) {
      button.disabled = false;
      button.textContent = "Delete";
      message.textContent = "The report could not be deleted.";
      message.classList.add("message-error");
      message.hidden = false;
      return;
    }
    await loadReports();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#submitReportButton");
    const text = reportText.value.trim();
    if (!text) return;
    button.disabled = true; button.textContent = "Saving report...";
    try {
      const translated = await callAi({ action: "translate", text });
      const name = membership.full_name || session.user.user_metadata?.full_name || session.user.email.split("@")[0];
      const { error } = await supabase.from("daily_reports").insert({ company_id: companyId, project_id: projectSelect.value || null, reporter_id: session.user.id, reporter_name: name, reporter_email: membership.email || session.user.email, report_date: reportDate.value, original_text: text, english_text: translated.english_text, english_summary: translated.english_summary });
      if (error) throw error;
      reportText.value = ""; filterDate.value = reportDate.value; await loadReports();
    } catch (error) { message.textContent = error.message || "The report could not be saved."; message.classList.add("message-error"); message.hidden = false; }
    finally { button.disabled = false; button.textContent = "Save report"; }
  });

  summaryButton.addEventListener("click", async () => {
    if (!reports.length) return;
    summaryButton.disabled = true; summaryButton.textContent = "Analyzing reports...";
    try {
      const data = await callAi({ action: "summarize", reports: reports.map((r) => ({ submitted_by: r.reporter_name, project: projects.find((p) => p.id === r.project_id)?.name || "General", report: r.english_text })) });
      const { error } = await supabase.from("daily_report_summaries").upsert({ company_id: companyId, report_date: filterDate.value, english_summary: data.english_summary, generated_by: session.user.id, updated_at: new Date().toISOString() }, { onConflict: "company_id,report_date" });
      if (error) throw error; await loadReports();
    } catch (error) { message.textContent = error.message || "The summary could not be created."; message.hidden = false; }
    finally { summaryButton.disabled = false; summaryButton.textContent = "Analyze daily reports"; }
  });
  filterDate.addEventListener("change", loadReports);
  employeePdfButton.addEventListener("click", () => exportGroupedPdf("employee"));
  projectPdfButton.addEventListener("click", () => exportGroupedPdf("project"));
  summaryPdfButton.addEventListener("click", exportSummaryPdf);
  setPdfAvailability();
  return { load: async () => { await loadProjects(); await loadReports(); } };
}
