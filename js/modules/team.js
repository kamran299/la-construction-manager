const ROLES = { owner_admin: "Owner / Admin", project_manager: "Project Manager", foreman_employee: "Foreman / Employee", viewer: "Viewer" };
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }

export function createTeamModule({ supabase, session, companyId, canManage }) {
  const list = document.querySelector("#teamList");
  const form = document.querySelector("#inviteForm");
  const message = document.querySelector("#teamMessage");
  document.querySelector("#inviteCard").hidden = !canManage;
  async function load() {
    const { data, error } = await supabase.from("company_members").select("*").eq("company_id", companyId).order("full_name");
    if (error) { message.textContent = "Users could not be loaded."; message.hidden = false; return; }
    list.innerHTML = (data || []).map((member) => `<article class="workspace-card team-member"><span class="avatar">${escapeHtml((member.full_name || member.email || "U")[0].toUpperCase())}</span><div><strong>${escapeHtml(member.full_name || "User")}</strong><small>${escapeHtml(member.email || "Email pending")}</small></div><span class="role-badge">${escapeHtml(ROLES[member.role] || member.role)}</span><i class="member-status ${member.is_active ? "is-active" : ""}">${member.is_active ? "Active" : "Inactive"}</i></article>`).join("");
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = document.querySelector("#inviteButton"); button.disabled = true; button.textContent = "Sending...";
    try {
      const response = await fetch("/.netlify/functions/team-invite", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ companyId, fullName: document.querySelector("#inviteName").value.trim(), email: document.querySelector("#inviteEmail").value.trim(), role: document.querySelector("#inviteRole").value, siteUrl: location.origin }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); form.reset(); message.textContent = "Invitation sent successfully."; message.classList.remove("message-error"); message.hidden = false; await load();
    } catch (error) { message.textContent = error.message || "Invitation could not be sent."; message.classList.add("message-error"); message.hidden = false; }
    finally { button.disabled = false; button.textContent = "Send invitation"; }
  });
  return { load };
}
