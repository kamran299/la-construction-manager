const ROLES = { owner_admin: "Owner / Admin", project_manager: "Project Manager", foreman_employee: "Foreman / Employee", viewer: "Viewer" };
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }

export function createTeamModule({ supabase, session, companyId, canManage, managerRole }) {
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
    const canEditMember = (member) => canManage && member.user_id !== session.user.id && member.role !== "owner_admin" && (managerRole === "owner_admin" || !["project_manager"].includes(member.role));
    const accounts = (memberResult.data || []).filter((member) => member.is_active).map((member) => `<article class="workspace-card team-member" data-member-row="${escapeHtml(member.id)}"><span class="avatar">${escapeHtml((member.full_name || member.email || "U")[0].toUpperCase())}</span><div><strong>${escapeHtml(member.full_name || "User")}</strong><small>${escapeHtml(member.email || "Phone account")}</small></div><span class="role-badge">${escapeHtml(ROLES[member.role] || member.role)}</span>${canEditMember(member) ? `<button class="secondary-button" type="button" data-edit-member="${escapeHtml(member.id)}">Edit</button><form class="team-member-editor" data-member-editor="${escapeHtml(member.id)}" hidden><label>Full name<input name="fullName" value="${escapeHtml(member.full_name || "")}" required></label><label>Role<select name="role">${Object.entries(ROLES).filter(([value]) => value !== "owner_admin" && (managerRole === "owner_admin" || value !== "project_manager")).map(([value, label]) => `<option value="${value}" ${member.role === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><div class="team-editor-actions"><button class="primary-button" type="submit">Save changes</button><button class="danger-outline-button" type="button" data-remove-member="${escapeHtml(member.id)}">Remove access</button></div></form>` : `<i class="member-status is-active">${member.user_id === session.user.id ? "Your account" : "Active"}</i>`}</article>`).join("");
    const workers = (workerResult.data || []).filter((worker) => worker.is_active && !worker.user_id).map((worker) => `<article class="workspace-card team-member" data-worker-row="${escapeHtml(worker.id)}"><span class="avatar">${escapeHtml(worker.full_name[0].toUpperCase())}</span><div><strong>${escapeHtml(worker.full_name)}</strong><small>${escapeHtml([worker.phone, worker.email, worker.trade].filter(Boolean).join(" · ") || "No contact details")}</small></div><span class="role-badge worker-roster-badge">Login pending</span>${canManage ? `<div class="worker-card-actions"><button class="secondary-button worker-resend-button" type="button" data-worker-id="${escapeHtml(worker.id)}">Send login text</button><button class="secondary-button" type="button" data-edit-worker="${escapeHtml(worker.id)}">Edit</button></div><form class="team-member-editor" data-worker-editor="${escapeHtml(worker.id)}" hidden><label>Full name<input name="fullName" value="${escapeHtml(worker.full_name)}" required></label><label>Phone<input name="phone" type="tel" value="${escapeHtml(worker.phone || "")}" required></label><label>Email<input name="email" type="email" value="${escapeHtml(worker.email || "")}"></label><label>Trade / work<input name="trade" value="${escapeHtml(worker.trade || "")}"></label><div class="team-editor-actions"><button class="primary-button" type="submit">Save changes</button><button class="danger-outline-button" type="button" data-remove-worker="${escapeHtml(worker.id)}">Remove worker</button></div></form>` : ""}</article>`).join("");
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
    button.textContent = "Adding & sending...";
    let error;
    let result;
    try {
      const response = await fetch("/.netlify/functions/worker-invite", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          companyId,
          fullName: document.querySelector("#workerName").value.trim(),
          phone: document.querySelector("#workerPhone").value.trim(),
          email: document.querySelector("#workerEmail").value.trim().toLowerCase(),
          trade: document.querySelector("#workerTrade").value.trim(),
          siteUrl: location.origin,
        }),
      });
      result = await response.json().catch(() => ({}));
      if (!response.ok) error = new Error(result.error || "Worker could not be added.");
    } catch (requestError) { error = requestError; }
    button.disabled = false;
    button.textContent = "Add worker & send text";
    if (error) {
      message.textContent = result?.workerSaved ? `Worker was saved, but the text could not be sent: ${error.message}` : `Worker could not be added: ${error.message}`;
      message.classList.add("message-error");
      message.hidden = false;
      return;
    }
    workerForm.reset();
    message.textContent = result?.textSent ? "Worker added and login invitation sent by text." : "Worker added. Text messaging must be connected before the invitation can be sent.";
    message.classList.toggle("message-error", !result?.textSent);
    message.hidden = false;
    await load();
  });

  list.addEventListener("click", async (event) => {
    const editMember = event.target.closest("[data-edit-member]");
    if (editMember) {
      const editor = list.querySelector(`[data-member-editor="${editMember.dataset.editMember}"]`);
      editor.hidden = !editor.hidden;
      return;
    }
    const editWorker = event.target.closest("[data-edit-worker]");
    if (editWorker) {
      const editor = list.querySelector(`[data-worker-editor="${editWorker.dataset.editWorker}"]`);
      editor.hidden = !editor.hidden;
      return;
    }
    const removeMember = event.target.closest("[data-remove-member]");
    const removeWorker = event.target.closest("[data-remove-worker]");
    if (removeMember || removeWorker) {
      if (!window.confirm("Remove this person's access? Their reports and work history will be kept.")) return;
      const targetType = removeMember ? "member" : "worker";
      const targetId = removeMember?.dataset.removeMember || removeWorker.dataset.removeWorker;
      await managePerson({ targetType, targetId, action: "remove" });
      return;
    }
    const button = event.target.closest("[data-worker-id]");
    if (!button || !canManage) return;
    button.disabled = true;
    button.textContent = "Sending...";
    try {
      const response = await fetch("/.netlify/functions/worker-invite", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ companyId, workerId: button.dataset.workerId, siteUrl: location.origin }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.textSent) throw new Error(result.error || "Text messaging is not connected yet.");
      message.textContent = "Login invitation sent by text.";
      message.classList.remove("message-error");
    } catch (error) {
      message.textContent = error.message || "The login text could not be sent.";
      message.classList.add("message-error");
    }
    message.hidden = false;
    button.disabled = false;
    button.textContent = "Send login text";
  });

  async function managePerson(payload) {
    const response = await fetch("/.netlify/functions/team-member-manage", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ companyId, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      message.textContent = result.error || "The user could not be updated.";
      message.classList.add("message-error");
      message.hidden = false;
      return false;
    }
    message.textContent = payload.action === "remove" ? "Access removed. Previous reports and work history were kept." : "User updated successfully.";
    message.classList.remove("message-error");
    message.hidden = false;
    await load();
    return true;
  }

  list.addEventListener("submit", async (event) => {
    const memberEditor = event.target.closest("[data-member-editor]");
    const workerEditor = event.target.closest("[data-worker-editor]");
    if (!memberEditor && !workerEditor) return;
    event.preventDefault();
    const formData = new FormData(event.target);
    const button = event.target.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Saving...";
    const targetType = memberEditor ? "member" : "worker";
    const targetId = memberEditor?.dataset.memberEditor || workerEditor.dataset.workerEditor;
    const fields = targetType === "member"
      ? { fullName: formData.get("fullName"), role: formData.get("role") }
      : { fullName: formData.get("fullName"), phone: formData.get("phone"), email: formData.get("email"), trade: formData.get("trade") };
    const saved = await managePerson({ targetType, targetId, action: "update", ...fields });
    if (!saved) { button.disabled = false; button.textContent = "Save changes"; }
  });
  return { load };
}
