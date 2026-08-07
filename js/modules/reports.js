function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }
function today() { return new Date().toLocaleDateString("en-CA"); }

export function createReportsModule({ supabase, session, companyId, membership, canManage }) {
  const form = document.querySelector("#reportForm");
  const list = document.querySelector("#reportsList");
  const message = document.querySelector("#reportsMessage");
  const reportDate = document.querySelector("#reportDate");
  const filterDate = document.querySelector("#reportsDateFilter");
  const projectSelect = document.querySelector("#reportProject");
  const summary = document.querySelector("#dailySummary");
  const summaryButton = document.querySelector("#summarizeReportsButton");
  reportDate.value = filterDate.value = today();
  summaryButton.hidden = !canManage;
  let projects = [];
  let reports = [];

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
      return `<article class="workspace-card report-card"><header><div><strong>${escapeHtml(r.reporter_name)}</strong><small>${escapeHtml(r.reporter_email || "")}</small></div><span>${escapeHtml(project?.name || "General")}</span></header><div class="report-original" dir="rtl" lang="fa">${escapeHtml(r.original_text)}</div><div class="report-english"><b>English</b><p>${escapeHtml(r.english_text)}</p><small>${escapeHtml(r.english_summary)}</small></div></article>`;
    }).join("") : '<div class="empty-projects">No reports were submitted for this date.</div>';
    const { data: saved } = await supabase.from("daily_report_summaries").select("english_summary").eq("company_id", companyId).eq("report_date", filterDate.value).maybeSingle();
    summary.hidden = !saved;
    if (saved) summary.innerHTML = `<h2>End-of-day summary</h2><p>${escapeHtml(saved.english_summary)}</p>`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#submitReportButton");
    const text = document.querySelector("#reportText").value.trim();
    if (!text) return;
    button.disabled = true; button.textContent = "Translating & saving...";
    try {
      const translated = await callAi({ action: "translate", text });
      const name = membership.full_name || session.user.user_metadata?.full_name || session.user.email.split("@")[0];
      const { error } = await supabase.from("daily_reports").insert({ company_id: companyId, project_id: projectSelect.value || null, reporter_id: session.user.id, reporter_name: name, reporter_email: membership.email || session.user.email, report_date: reportDate.value, original_text: text, english_text: translated.english_text, english_summary: translated.english_summary });
      if (error) throw error;
      document.querySelector("#reportText").value = ""; filterDate.value = reportDate.value; await loadReports();
    } catch (error) { message.textContent = error.message || "The report could not be saved."; message.classList.add("message-error"); message.hidden = false; }
    finally { button.disabled = false; button.textContent = "Translate & save report"; }
  });

  summaryButton.addEventListener("click", async () => {
    if (!reports.length) return;
    summaryButton.disabled = true; summaryButton.textContent = "Creating summary...";
    try {
      const data = await callAi({ action: "summarize", reports: reports.map((r) => ({ submitted_by: r.reporter_name, project: projects.find((p) => p.id === r.project_id)?.name || "General", report: r.english_text })) });
      const { error } = await supabase.from("daily_report_summaries").upsert({ company_id: companyId, report_date: filterDate.value, english_summary: data.english_summary, generated_by: session.user.id, updated_at: new Date().toISOString() }, { onConflict: "company_id,report_date" });
      if (error) throw error; await loadReports();
    } catch (error) { message.textContent = error.message || "The summary could not be created."; message.hidden = false; }
    finally { summaryButton.disabled = false; summaryButton.textContent = "Create end-of-day summary"; }
  });
  filterDate.addEventListener("change", loadReports);
  return { load: async () => { await loadProjects(); await loadReports(); } };
}
