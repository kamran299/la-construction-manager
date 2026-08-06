import { createLoginModule } from "./modules/login.js";
import { getSupabaseClient } from "./services/supabase.js";

const configMessage = document.querySelector("#configMessage");

function showConfigurationError(error) {
  configMessage.textContent = error.message;
  configMessage.hidden = false;
  document.querySelector("#loginForm").hidden = true;
}

function handleAuthenticated(session) {
  // The dashboard becomes the next module. Keep the signed-in session ready for it.
  configMessage.textContent = `Signed in as ${session.user.email}. The workspace dashboard will be added in the next module.`;
  configMessage.classList.remove("message-error");
  configMessage.hidden = false;
  document.querySelector("#loginForm").hidden = true;
  document.dispatchEvent(new CustomEvent("app:authenticated", { detail: { session } }));
}

async function start() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (data.session) {
      handleAuthenticated(data.session);
      return;
    }

    createLoginModule({ supabase, onAuthenticated: handleAuthenticated }).focus();
  } catch (error) {
    showConfigurationError(error);
  }
}

start();
