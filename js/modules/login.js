const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyAuthError(error) {
  const message = error?.message?.toLowerCase() || "";
  if (message.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (message.includes("email not confirmed")) return "Confirm your email address before signing in.";
  if (message.includes("too many requests")) return "Too many attempts. Please wait a moment and try again.";
  return "We could not sign you in. Please try again.";
}

export function createLoginModule({ supabase, onAuthenticated }) {
  const form = document.querySelector("#loginForm");
  const email = document.querySelector("#email");
  const password = document.querySelector("#password");
  const emailError = document.querySelector("#emailError");
  const passwordError = document.querySelector("#passwordError");
  const formMessage = document.querySelector("#formMessage");
  const submitButton = document.querySelector("#submitButton");
  const togglePassword = document.querySelector("#togglePassword");

  function showFieldError(input, output, message = "") {
    input.setAttribute("aria-invalid", String(Boolean(message)));
    output.textContent = message;
  }

  function validate() {
    const emailValue = email.value.trim();
    const passwordValue = password.value;
    const emailMessage = !emailValue ? "Enter your email address." : !EMAIL_PATTERN.test(emailValue) ? "Enter a valid email address." : "";
    const passwordMessage = !passwordValue ? "Enter your password." : passwordValue.length < 6 ? "Password must contain at least 6 characters." : "";
    showFieldError(email, emailError, emailMessage);
    showFieldError(password, passwordError, passwordMessage);
    return !emailMessage && !passwordMessage;
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.classList.toggle("is-loading", isLoading);
    form.setAttribute("aria-busy", String(isLoading));
  }

  function showMessage(message, isError = false) {
    formMessage.textContent = message;
    formMessage.classList.toggle("message-error", isError);
    formMessage.hidden = !message;
  }

  togglePassword.addEventListener("click", () => {
    const shouldShow = password.type === "password";
    password.type = shouldShow ? "text" : "password";
    togglePassword.textContent = shouldShow ? "Hide" : "Show";
    togglePassword.setAttribute("aria-pressed", String(shouldShow));
  });

  email.addEventListener("input", () => showFieldError(email, emailError));
  password.addEventListener("input", () => showFieldError(password, passwordError));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");
    if (!validate()) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    setLoading(false);

    if (error) {
      showMessage(friendlyAuthError(error), true);
      password.focus();
      return;
    }

    showMessage("Signed in successfully. Loading your workspace…");
    onAuthenticated(data.session);
  });

  return { focus: () => email.focus() };
}
