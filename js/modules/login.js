const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeUsPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(value || "").trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

function friendlyAuthError(error) {
  const message = error?.message?.toLowerCase() || "";
  if (message.includes("too many requests")) return "Too many attempts. Please wait a moment and try again.";
  return "The sign-in link could not be sent. Please wait a moment and try again.";
}

export function createLoginModule({ supabase, onAuthenticated }) {
  const form = document.querySelector("#loginForm");
  const email = document.querySelector("#email");
  const emailError = document.querySelector("#emailError");
  const formMessage = document.querySelector("#formMessage");
  const submitButton = document.querySelector("#submitButton");
  const emailLoginTab = document.querySelector("#emailLoginTab");
  const phoneLoginTab = document.querySelector("#phoneLoginTab");
  const phoneForm = document.querySelector("#phoneLoginForm");
  const phone = document.querySelector("#loginPhone");
  const code = document.querySelector("#loginCode");
  const phoneError = document.querySelector("#phoneError");
  const codeError = document.querySelector("#codeError");
  const otpField = document.querySelector("#otpField");
  const phoneMessage = document.querySelector("#phoneFormMessage");
  const phoneSubmit = document.querySelector("#phoneSubmitButton");
  const changePhone = document.querySelector("#changePhoneButton");
  let awaitingCode = false;
  let verifiedPhone = "";

  function showFieldError(input, output, message = "") {
    input.setAttribute("aria-invalid", String(Boolean(message)));
    output.textContent = message;
  }

  function validate() {
    const emailValue = email.value.trim();
    const emailMessage = !emailValue ? "Enter your email address." : !EMAIL_PATTERN.test(emailValue) ? "Enter a valid email address." : "";
    showFieldError(email, emailError, emailMessage);
    return !emailMessage;
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

  function selectMethod(method) {
    const usePhone = method === "phone";
    form.hidden = usePhone;
    phoneForm.hidden = !usePhone;
    emailLoginTab.classList.toggle("is-active", !usePhone);
    phoneLoginTab.classList.toggle("is-active", usePhone);
    emailLoginTab.setAttribute("aria-selected", String(!usePhone));
    phoneLoginTab.setAttribute("aria-selected", String(usePhone));
    (usePhone ? phone : email).focus();
  }

  function showPhoneMessage(message, isError = false) {
    phoneMessage.textContent = message;
    phoneMessage.classList.toggle("message-error", isError);
    phoneMessage.hidden = !message;
  }

  function setPhoneLoading(isLoading) {
    phoneSubmit.disabled = isLoading;
    phoneSubmit.classList.toggle("is-loading", isLoading);
    phoneForm.setAttribute("aria-busy", String(isLoading));
  }

  function resetPhoneStep() {
    awaitingCode = false;
    verifiedPhone = "";
    phone.readOnly = false;
    code.value = "";
    otpField.hidden = true;
    changePhone.hidden = true;
    phoneSubmit.querySelector(".button-label").textContent = "Text me a sign-in code";
    showPhoneMessage("");
    phone.focus();
  }

  emailLoginTab.addEventListener("click", () => selectMethod("email"));
  phoneLoginTab.addEventListener("click", () => selectMethod("phone"));
  changePhone.addEventListener("click", resetPhoneStep);

  email.addEventListener("input", () => showFieldError(email, emailError));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");
    if (!validate()) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.value.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    setLoading(false);

    if (error) {
      showMessage(friendlyAuthError(error), true);
      email.focus();
      return;
    }

    showMessage("Check your email and open the L&A sign-in link. No password is required. You may close this page after the email arrives.");
  });

  phoneForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showPhoneMessage("");
    phoneError.textContent = "";
    codeError.textContent = "";

    if (!awaitingCode) {
      verifiedPhone = normalizeUsPhone(phone.value);
      if (!verifiedPhone) {
        phoneError.textContent = "Enter a valid mobile phone number.";
        phone.focus();
        return;
      }
      setPhoneLoading(true);
      const { error } = await supabase.auth.signInWithOtp({ phone: verifiedPhone, options: { shouldCreateUser: true } });
      setPhoneLoading(false);
      if (error) {
        const detail = error.message?.toLowerCase() || "";
        showPhoneMessage(detail.includes("provider") || detail.includes("unsupported")
          ? "Phone sign-in is not connected yet. Please contact your company administrator."
          : "The sign-in code could not be sent. Check the number and try again.", true);
        return;
      }
      awaitingCode = true;
      phone.readOnly = true;
      otpField.hidden = false;
      changePhone.hidden = false;
      phoneSubmit.querySelector(".button-label").textContent = "Verify code & sign in";
      showPhoneMessage("A 6-digit code was sent to your phone.");
      code.focus();
      return;
    }

    const otp = code.value.replace(/\D/g, "");
    if (otp.length !== 6) {
      codeError.textContent = "Enter the 6-digit code from the text message.";
      code.focus();
      return;
    }
    setPhoneLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone: verifiedPhone, token: otp, type: "sms" });
    if (error || !data.session) {
      setPhoneLoading(false);
      showPhoneMessage("That code is incorrect or expired. Please try again.", true);
      code.focus();
      return;
    }

    const { data: existingMembership, error: membershipError } = await supabase
      .from("company_members")
      .select("id")
      .eq("user_id", data.session.user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!membershipError && existingMembership) {
      showPhoneMessage("Signed in successfully. Loading your workspace…");
      onAuthenticated(data.session);
      return;
    }

    const { data: memberClaimedCount, error: memberClaimError } = await supabase.rpc("claim_member_phone_access");
    if (!memberClaimError && Number(memberClaimedCount || 0) > 0) {
      showPhoneMessage("Signed in successfully. Loading your workspace…");
      onAuthenticated(data.session);
      return;
    }

    const { data: claimedCount, error: claimError } = await supabase.rpc("claim_worker_membership");
    if (claimError || Number(claimedCount || 0) < 1) {
      await supabase.auth.signOut();
      setPhoneLoading(false);
      showPhoneMessage("This phone number is not connected to an active user or worker. Ask your company administrator to add it.", true);
      return;
    }
    showPhoneMessage("Signed in successfully. Loading your workspace…");
    onAuthenticated(data.session);
  });

  return { focus: () => email.focus() };
}
