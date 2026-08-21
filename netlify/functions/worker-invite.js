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

async function sendInvitation({ phone, siteUrl }) {
  const accountSid = Netlify.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = Netlify.env.get("TWILIO_MESSAGING_SERVICE_SID");
  const fromNumber = Netlify.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) return { sent: false, configurationRequired: true };

  const parameters = new URLSearchParams({
    To: phone,
    Body: `L&A Custom Homes: You were added to the employee time clock. Open ${siteUrl}, choose Worker phone, and request your sign-in code. Reply STOP to opt out.`,
  });
  if (messagingServiceSid) parameters.set("MessagingServiceSid", messagingServiceSid);
  else parameters.set("From", fromNumber);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: parameters.toString(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Twilio could not send the invitation");
  return { sent: true, sid: result.sid };
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
  if (!companyId) return json(400, { error: "Company is required" });

  const adminHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const membershipResponse = await fetch(`${url}/rest/v1/company_members?company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${caller.id}&is_active=eq.true&select=role`, { headers: adminHeaders });
  const memberships = membershipResponse.ok ? await membershipResponse.json() : [];
  if (!memberships.some(({ role }) => ["owner_admin", "project_manager"].includes(role))) return json(403, { error: "Manager access required" });

  let worker;
  const workerId = String(body.workerId || "").trim();
  if (workerId) {
    const workerResponse = await fetch(`${url}/rest/v1/company_workers?id=eq.${encodeURIComponent(workerId)}&company_id=eq.${encodeURIComponent(companyId)}&select=*`, { headers: adminHeaders });
    const workers = workerResponse.ok ? await workerResponse.json() : [];
    worker = workers[0];
    if (!worker) return json(404, { error: "Worker was not found" });
  } else {
    const fullName = String(body.fullName || "").trim();
    const phone = normalizePhone(body.phone);
    const email = String(body.email || "").trim().toLowerCase() || null;
    const trade = String(body.trade || "").trim() || null;
    if (!fullName || !phone) return json(400, { error: "Enter the worker's name and a valid mobile number" });

    const existingResponse = await fetch(`${url}/rest/v1/company_workers?company_id=eq.${encodeURIComponent(companyId)}&select=*`, { headers: adminHeaders });
    const existingWorkers = existingResponse.ok ? await existingResponse.json() : [];
    worker = existingWorkers.find((item) => normalizePhone(item.phone) === phone);
    if (worker) {
      const updateResponse = await fetch(`${url}/rest/v1/company_workers?id=eq.${encodeURIComponent(worker.id)}`, {
        method: "PATCH",
        headers: { ...adminHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ full_name: fullName, phone, email, trade, is_active: true }),
      });
      const updated = updateResponse.ok ? await updateResponse.json() : [];
      worker = updated[0] || worker;
    } else {
      const createResponse = await fetch(`${url}/rest/v1/company_workers`, {
        method: "POST",
        headers: { ...adminHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ company_id: companyId, full_name: fullName, phone, email, trade, is_active: true, created_by: caller.id }),
      });
      const created = await createResponse.json().catch(() => []);
      if (!createResponse.ok || !created[0]) return json(400, { error: created.message || "Worker could not be saved" });
      worker = created[0];
    }
  }

  const configuredUrl = Netlify.env.get("URL") || body.siteUrl || new URL(request.url).origin;
  let siteUrl;
  try { siteUrl = new URL(configuredUrl).origin; } catch { return json(400, { error: "Application URL is invalid" }); }
  try {
    const invitation = await sendInvitation({ phone: normalizePhone(worker.phone), siteUrl });
    return json(200, { ok: true, workerId: worker.id, textSent: invitation.sent, configurationRequired: invitation.configurationRequired || false });
  } catch (error) {
    return json(502, { error: error.message || "The worker was saved, but the text could not be sent", workerSaved: true });
  }
};
