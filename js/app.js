import { createLoginModule } from "./modules/login.js?v=20260826-passwordless-login-1";
import { showDashboard } from "./modules/dashboard.js?v=20260826-manager-labor-1";
import { getSupabaseClient } from "./services/supabase.js";

const configMessage = document.querySelector("#configMessage");

function showConfigurationError(error) {
  configMessage.textContent = error.message;
  configMessage.hidden = false;
  document.querySelector("#loginForm").hidden = true;
}

async function start() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const handleAuthenticated = (session) => showDashboard({ supabase, session });
    if (data.session) return handleAuthenticated(data.session);

    createLoginModule({ supabase, onAuthenticated: handleAuthenticated }).focus();
  } catch (error) {
    showConfigurationError(error);
  }
}

start();
