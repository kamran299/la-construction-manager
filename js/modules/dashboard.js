const ROLE_NAMES = {
  owner_admin: "Owner / Admin",
  project_manager: "Project Manager",
  foreman_employee: "Foreman / Employee",
  viewer: "Viewer",
};

function displayName(user) {
  return user.user_metadata?.full_name || user.email?.split("@")[0] || "there";
}

export async function showDashboard({ supabase, session }) {
  const loginView = document.querySelector("#loginView");
  const dashboardView = document.querySelector("#dashboardView");
  const message = document.querySelector("#dashboardMessage");
  const name = displayName(session.user);

  loginView.hidden = true;
  dashboardView.hidden = false;
  document.querySelector("#welcomeName").textContent = name;
  document.querySelector("#sidebarUserName").textContent = name;
  document.querySelector("#userInitial").textContent = name.charAt(0).toUpperCase();
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  }).format(new Date());

  document.querySelector("#signOutButton").onclick = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("*, companies(*)")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError) {
    console.error("Unable to load workspace membership", membershipError);
    message.textContent = "Your account is connected. Company workspace setup is still required.";
    message.classList.remove("message-error");
    message.hidden = false;
    document.querySelector("#projectCount").textContent = "0";
    document.querySelector("#roleLabel").textContent = "Member";
    return;
  }

  const role = ROLE_NAMES[membership?.role] || "Member";
  document.querySelector("#roleLabel").textContent = role;
  document.querySelector("#sidebarUserRole").textContent = role;

  if (!membership?.companies) {
    document.querySelector("#companyLabel").textContent = "Your account is not connected to a company workspace yet.";
    document.querySelector("#projectCount").textContent = "0";
    return;
  }

  document.querySelector("#companyLabel").textContent = `${membership.companies.name} workspace overview`;
  const { count, error: projectError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("company_id", membership.companies.id);

  document.querySelector("#projectCount").textContent = projectError ? "—" : String(count ?? 0);
}
