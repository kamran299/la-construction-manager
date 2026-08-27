function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
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
  const body = await request.json();
  const companyId = String(body.companyId || "").trim();
  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const role = String(body.role || "").trim();
  const allowedRoles = ["project_manager", "foreman_employee", "viewer"];
  if (!companyId || !fullName || !email || phone === null || !allowedRoles.includes(role)) {
    return json(400, { error: "Please enter a valid name, email, and role" });
  }
  const adminHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const membershipResponse = await fetch(`${url}/rest/v1/company_members?company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${caller.id}&is_active=eq.true&select=role`, { headers: adminHeaders });
  const memberships = membershipResponse.ok ? await membershipResponse.json() : [];
  if (!memberships.some(({ role }) => ["owner_admin", "project_manager"].includes(role))) return json(403, { error: "Manager access required" });
  const redirectTo = encodeURIComponent(body.siteUrl || "");
  const inviteResponse = await fetch(`${url}/auth/v1/invite?redirect_to=${redirectTo}`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      email,
      data: { full_name: fullName, company_id: companyId, company_role: role, invited_by: caller.id },
    }),
  });
  const invited = await inviteResponse.json();
  if (!inviteResponse.ok) return json(400, { error: invited.msg || invited.message || "Invitation failed" });
  const memberResponse = await fetch(`${url}/rest/v1/company_members?on_conflict=company_id,user_id`, {
    method: "POST", headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ company_id: companyId, user_id: invited.id, full_name: fullName, email, phone: phone || null, role, is_active: true }),
  });
  if (!memberResponse.ok) return json(400, { error: "User was invited but membership could not be saved" });
  return json(200, { ok: true });
};
