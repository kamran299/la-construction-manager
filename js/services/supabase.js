import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let client;
let publicConfig;

export async function getPublicConfig() {
  if (publicConfig) return publicConfig;

  const response = await fetch("/.netlify/functions/supabase-config", { cache: "no-store" });
  const config = await response.json().catch(() => ({}));

  if (!response.ok || !config.url || !config.key) {
    throw new Error(config.error || "Supabase is not configured for this environment.");
  }

  publicConfig = config;
  return publicConfig;
}

export async function getSupabaseClient() {
  if (client) return client;

  const config = await getPublicConfig();

  client = createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  return client;
}
