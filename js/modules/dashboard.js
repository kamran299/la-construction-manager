import { createProjectsModule } from "./projects.js";
import { createReportsModule } from "./reports.js";
import { createTeamModule } from "./team.js";

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
  const views = {
    dashboard: document.querySelector("#dashboardView > .dashboard-content"),
    projects: document.querySelector("#projectsView"),
    reports: document.querySelector("#reportsView"),
    team: document.querySelector("#teamView"),
  };
  const modules = {};
  function navigate(name) {
    Object.entries(views).forEach(([key, view]) => { view.hidden = key !== name; });
    document.querySelectorAll(".nav-item").forEach((item) => {
      const active = item.getAttribute("href") === `#${name}`;
      item.classList.toggle("is-active", active);
      item.toggleAttribute("aria-current", active);
    });
    modules[name]?.load?.();
  }
  modules.projects = createProjectsModule({
    supabase,
    companyId: membership.companies.id,
    canManage: ["owner_admin", "project_manager"].includes(membership.role),
    onCountChange: (nextCount) => { document.querySelector("#projectCount").textContent = String(nextCount); },
    onNavigate: navigate,
  });
  modules.reports = createReportsModule({ supabase, session, companyId: membership.companies.id, membership, canManage: ["owner_admin", "project_manager"].includes(membership.role) });
  modules.team = createTeamModule({ supabase, session, companyId: membership.companies.id, canManage: ["owner_admin", "project_manager"].includes(membership.role) });
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", (event) => { event.preventDefault(); navigate(item.getAttribute("href").slice(1)); }));
  navigate(location.hash.slice(1) in views ? location.hash.slice(1) : "dashboard");
}
