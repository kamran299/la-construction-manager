function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const url = Netlify.env.get("SUPABASE_URL");
  const publicKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !publicKey || !serviceKey || !token) return json(401, { error: "Service is not configured" });

  const authResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: publicKey, authorization: `Bearer ${token}` } });
  if (!authResponse.ok) return json(401, { error: "Invalid session" });
  const caller = await authResponse.json();
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "").trim();
  const targetId = String(body.targetId || "").trim();
  const targetType = String(body.targetType || "");
  const action = String(body.action || "");
  if (!companyId || !targetId || !["member", "worker"].includes(targetType) || !["update", "remove"].includes(action)) return json(400, { error: "Invalid request" });

  const adminHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const callerMembershipResponse = await fetch(`${url}/rest/v1/company_members?company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${caller.id}&is_active=eq.true&select=role`, { headers: adminHeaders });
  const callerMemberships = callerMembershipResponse.ok ? await callerMembershipResponse.json() : [];
  const callerRole = callerMemberships[0]?.role;
  if (!["owner_admin", "project_manager"].includes(callerRole)) return json(403, { error: "Manager access required" });

  if (targetType === "member") {
    const targetResponse = await fetch(`${url}/rest/v1/company_members?id=eq.${encodeURIComponent(targetId)}&company_id=eq.${encodeURIComponent(companyId)}&select=*`, { headers: adminHeaders });
    const targets = targetResponse.ok ? await targetResponse.json() : [];
    const target = targets[0];
    if (!target) return json(404, { error: "User was not found" });
    const isSelf = target.user_id === caller.id;
    if (isSelf && (action !== "update" || body.selfPhoneOnly !== true)) return json(400, { error: "You can only update the phone number on your own account here" });
    if (!isSelf && target.role === "owner_admin") return json(403, { error: "The owner account cannot be changed or removed" });
    if (callerRole === "project_manager" && target.role === "project_manager") return json(403, { error: "Only the owner can manage another project manager" });

    let changes;
    if (action === "remove") {
      changes = { is_active: false };
    } else {
      const fullName = isSelf ? target.full_name : String(body.fullName || "").trim();
      const role = isSelf ? target.role : String(body.role || "");
      const rawPhone = String(body.phone || "").trim();
      const phone = rawPhone ? normalizePhone(rawPhone) : "";
      const allowedRoles = callerRole === "owner_admin" ? ["project_manager", "foreman_employee", "viewer"] : ["foreman_employee", "viewer"];
      if (!fullName || (!isSelf && !allowedRoles.includes(role)) || (rawPhone && !phone)) return json(400, { error: "Enter a valid name, phone number, and role" });
      changes = { full_name: fullName, phone: phone || null, role };
    }
    const updateResponse = await fetch(`${url}/rest/v1/company_members?id=eq.${encodeURIComponent(targetId)}&company_id=eq.${encodeURIComponent(companyId)}`, {
      method: "PATCH", headers: { ...adminHeaders, Prefer: "return=minimal" }, body: JSON.stringify(changes),
    });
    if (!updateResponse.ok) return json(400, { error: "The user could not be updated" });
    const aliasChanges = action === "remove" || normalizePhone(target.phone) !== normalizePhone(changes.phone)
      ? { is_active: false }
      : { full_name: changes.full_name, phone: changes.phone, role: changes.role, is_active: true };
    await fetch(`${url}/rest/v1/company_members?company_id=eq.${encodeURIComponent(companyId)}&login_alias_of=eq.${encodeURIComponent(target.user_id)}`, {
      method: "PATCH", headers: { ...adminHeaders, Prefer: "return=minimal" }, body: JSON.stringify(aliasChanges),
    });
    return json(200, { ok: true });
  }

  let changes;
  if (action === "remove") {
    changes = { is_active: false };
  } else {
    const fullName = String(body.fullName || "").trim();
    const phone = normalizePhone(body.phone);
    if (!fullName || !phone) return json(400, { error: "Enter a valid worker name and phone number" });
    changes = {
      full_name: fullName,
      phone,
      email: String(body.email || "").trim().toLowerCase() || null,
      trade: String(body.trade || "").trim() || null,
    };
  }
  const updateResponse = await fetch(`${url}/rest/v1/company_workers?id=eq.${encodeURIComponent(targetId)}&company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH", headers: { ...adminHeaders, Prefer: "return=minimal" }, body: JSON.stringify(changes),
  });
  if (!updateResponse.ok) return json(400, { error: "The worker could not be updated" });
  return json(200, { ok: true });
};
