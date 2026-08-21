const ROLES = { owner_admin: "Owner / Admin", project_manager: "Project Manager", foreman_employee: "Foreman / Employee", viewer: "Viewer" };
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }

export function createTeamModule({ supabase, session, companyId, canManage }) {
  const list = document.querySelector("#teamList");
  const form = document.querySelector("#inviteForm");
  const workerForm = document.querySelector("#workerForm");
  const message = document.querySelector("#teamMessage");
  document.querySelector("#inviteCard").hidden = !canManage;
  document.querySelector("#workerCard").hidden = !canManage;
  async function load() {
    const [memberResult, workerResult] = await Promise.all([
      supabase.from("company_members").select("*").eq("company_id", companyId).order("full_name"),
      supabase.from("company_workers").select("*").eq("company_id", companyId).order("full_name"),
    ]);
    if (memberResult.error || workerResult.error) { message.textContent = "Users and workers could not be loaded."; message.hidden = false; return; }
    const accounts = (memberResult.data || []).map((member) => `<article class="workspace-card team-member"><span class="avatar">${escapeHtml((member.full_name || member.email || "U")[0].toUpperCase())}</span><div><strong>${escapeHtml(member.full_name || "User")}</strong><small>${escapeHtml(member.email || "Email pending")}</small></div><span class="role-badge">${escapeHtml(ROLES[member.role] || member.role)}</span><i class="member-status ${member.is_active ? "is-active" : ""}">${member.is_active ? "Active" : "Inactive"}</i></article>`).join("");
    const workers = (workerResult.data || []).map((worker) => `<article class="workspace-card team-member"><span class="avatar">${escapeHtml(worker.full_name[0].toUpperCase())}</span><div><strong>${escapeHtml(worker.full_name)}</strong><small>${escapeHtml([worker.phone, worker.email, worker.trade].filter(Boolean).join(" · ") || "No contact details")}</small></div><span class="role-badge worker-roster-badge">Worker roster</span><i class="member-status ${worker.is_active ? "is-active" : ""}">${worker.is_active ? "Active" : "Inactive"}</i></article>`).join("");
    list.innerHTML = accounts + workers || '<p class="tasks-empty">No users or workers have been added.</p>';
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = document.querySelector("#inviteButton"); button.disabled = true; button.textContent = "Sending...";
    try {
      const response = await fetch("/.netlify/functions/team-invite", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ companyId, fullName: document.querySelector("#inviteName").value.trim(), email: document.querySelector("#inviteEmail").value.trim(), role: document.querySelector("#inviteRole").value, siteUrl: location.origin }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); form.reset(); message.textContent = "Invitation sent successfully."; message.classList.remove("message-error"); message.hidden = false; await load();
    } catch (error) { message.textContent = error.message || "Invitation could not be sent."; message.classList.add("message-error"); message.hidden = false; }
    finally { button.disabled = false; button.textContent = "Send invitation"; }
  });
  workerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#workerButton");
    button.disabled = true;
    const { error } = await supabase.from("company_workers").insert({
      company_id: companyId,
      full_name: document.querySelector("#workerName").value.trim(),
      phone: document.querySelector("#workerPhone").value.trim() || null,
      email: document.querySelector("#workerEmail").value.trim().toLowerCase() || null,
      trade: document.querySelector("#workerTrade").value.trim() || null,
    });
    button.disabled = false;
    if (error) {
      message.textContent = `Worker could not be added: ${error.message}`;
      message.classList.add("message-error");
      message.hidden = false;
      return;
    }
    workerForm.reset();
    message.textContent = "Worker added to the labor roster.";
    message.classList.remove("message-error");
    message.hidden = false;
    await load();
  });
  return { load };
}
