function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });
}

async function verifyUser(token, supabaseUrl, publicKey) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publicKey, authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : null;
}

const CONSTRUCTION_GLOSSARY = `
L&A Custom Homes vocabulary for Persian/English field reports:
- Poly (پُلی/پلی) is a person's name; always write Poly, never plate compactor.
- subfloor (ساب فلور/ساب‌فلور) means subfloor; never scaffolding.
- truckload of concrete (تراک کانکریت), concrete truck (تراک بتن), concrete pump (پمپ بتن), pour/poured concrete (بتن‌ریزی/کانکریت ریختن).
- excavation (اکسکویشن/خاک‌برداری), grading (گریدینگ), compaction (کامپکشن), plate compactor (پلیت کامپکتور), trench (ترنچ), backfill (بک‌فیل).
- layout (لی‌اوت), survey (سِروی), footing (فوتینگ), foundation (فاندیشن), formwork/forms (فرم‌ورک/قالب), rebar (ریبار/آرماتور), anchor bolt (انکر بولت), slab (اسلب), stem wall (استم وال), retaining wall (ریتینینگ وال), waterproofing (واترپروفینگ), drainage (درینج).
- framing (فریمینگ), joist (جویست), beam (بیم), header (هِدِر), shear wall (شیر وال), sheathing (شیتینگ), blocking (بلاکینگ), truss (تراس), roof framing (روف فریمینگ).
- rough-in (راف‌این), MEP, plumbing (پلامینگ), electrical (الکتریکال), HVAC, ductwork (داکت‌ورک), fire sprinkler (فایر اسپرینکلر), low voltage (لو وُلتج).
- insulation (اینسولیشن), drywall/sheetrock (درای‌وال/شیت‌راک), taping (تیپینگ), texture (تکسچر), stucco (استاکو), siding (سایدینگ), flashing (فلشینگ), roofing (روفینگ), scaffolding (اسکفولدینگ).
- window (ویندو), door (دور), cabinet (کابینت), countertop (کانترتاپ), tile (تایل), hardwood (هاردوود), flooring (فلورینگ), baseboard (بیس‌بورد), trim (تریم), painting (پینتینگ), finish carpentry (فینیش کارپنتری).
- inspection (اینزپکشن), correction notice (کورکشن نوتیس), punch list (پانچ‌لیست), change order (چنج اوردر), RFI, submittal, material delivery (متریال دلیوری), subcontractor/sub (ساب‌کانترکتور/ساب), superintendent (سوپرینتندنت), foreman (فورمن), crew (کرو).
Preserve all people, company and project names, addresses, dates, times, measurements and quantities exactly. If a word may be a person's name or an unfamiliar construction term, transcribe it phonetically instead of replacing it with unrelated equipment or work.`;

function transcriptionUsage(data, model, durationMs) {
  const usage = data?.usage || {};
  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || inputTokens + outputTokens;
  const seconds = Number(usage.seconds) || 0;
  let estimatedCostUsd = null;
  if (/^gpt-4o-mini-transcribe(?:-|$)/i.test(model)) {
    estimatedCostUsd = ((inputTokens * 1.25) + (outputTokens * 5.00)) / 1_000_000;
  } else if (/^whisper-1$/i.test(model) && seconds > 0) {
    estimatedCostUsd = (seconds / 60) * 0.006;
  }
  return {
    provider: "OpenAI",
    operation: "voice_transcription",
    model,
    input_tokens: inputTokens,
    cached_input_tokens: 0,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    audio_seconds: seconds,
    estimated_cost_usd: estimatedCostUsd === null ? null : Number(estimatedCostUsd.toFixed(8)),
    duration_ms: Math.max(0, Number(durationMs) || 0),
  };
}

async function transcribe(openaiKey, audio, model) {
  const body = new FormData();
  body.append("file", audio, audio.name || "persian-report.webm");
  body.append("model", model);
  body.append("prompt", `A Persian or English daily construction field report containing project names, addresses, trade work, materials, safety notes, delays, and next steps. ${CONSTRUCTION_GLOSSARY}`);
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${openaiKey}` },
    body,
  });
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const publicKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const openaiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!token || !supabaseUrl || !publicKey || !openaiKey) return json(401, { error: "Service is not configured" });
  if (!(await verifyUser(token, supabaseUrl, publicKey))) return json(401, { error: "Invalid session" });

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!audio || typeof audio.arrayBuffer !== "function" || !audio.size) return json(400, { error: "A voice recording is required" });
    if (audio.size > 4 * 1024 * 1024) return json(413, { error: "The recording is too long. Please record a shorter report." });

    const configuredModel = Netlify.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";
    let usedModel = configuredModel;
    const startedAt = Date.now();
    let response = await transcribe(openaiKey, audio, configuredModel);
    if (!response.ok && configuredModel !== "whisper-1") {
      usedModel = "whisper-1";
      response = await transcribe(openaiKey, audio, usedModel);
    }
    if (!response.ok) return json(502, { error: "Voice transcription is temporarily unavailable" });
    const data = await response.json();
    return json(200, { text: String(data.text || "").trim(), ai_usage: transcriptionUsage(data, usedModel, Date.now() - startedAt) });
  } catch {
    return json(400, { error: "The voice recording could not be processed" });
  }
};
