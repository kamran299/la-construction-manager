function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
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
  const adminHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const membershipResponse = await fetch(`${url}/rest/v1/company_members?company_id=eq.${encodeURIComponent(body.companyId)}&user_id=eq.${caller.id}&is_active=eq.true&select=role`, { headers: adminHeaders });
  const memberships = membershipResponse.ok ? await membershipResponse.json() : [];
  if (!memberships.some(({ role }) => ["owner_admin", "project_manager"].includes(role))) return json(403, { error: "Manager access required" });
  const redirectTo = encodeURIComponent(body.siteUrl || "");
  const inviteResponse = await fetch(`${url}/auth/v1/invite?redirect_to=${redirectTo}`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ email: body.email, data: { full_name: body.fullName } }) });
  const invited = await inviteResponse.json();
  if (!inviteResponse.ok) return json(400, { error: invited.msg || invited.message || "Invitation failed" });
  const memberResponse = await fetch(`${url}/rest/v1/company_members?on_conflict=company_id,user_id`, {
    method: "POST", headers: { ...adminHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ company_id: body.companyId, user_id: invited.id, full_name: body.fullName, email: body.email, role: body.role, is_active: true }),
  });
  if (!memberResponse.ok) return json(400, { error: "User was invited but membership could not be saved" });
  return json(200, { ok: true });
};
