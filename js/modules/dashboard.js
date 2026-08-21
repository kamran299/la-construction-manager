import { createProjectsModule } from "./projects.js";
import { createReportsModule } from "./reports.js?v=20260820-gps-time-clock-1";
import { createTeamModule } from "./team.js?v=20260820-phone-login-2";
import { createTasksModule } from "./tasks.js?v=20260820-gps-time-clock-1";
import { createAlertsModule, createFilesModule, createInspectionsModule, createLaborModule, createMaterialsModule, createScheduleModule, createSubcontractorsModule } from "./operations.js?v=20260820-phone-login-2";

const ROLE_NAMES = {
  owner_admin: "Owner / Admin",
  project_manager: "Project Manager",
  foreman_employee: "Foreman / Employee",
  viewer: "Viewer",
};

function displayName(user) {
  return user.user_metadata?.full_name || user.email?.split("@")[0] || "there";
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
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
  const employeeOnly = membership?.role === "foreman_employee";

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
  async function loadOperationsMetrics() {
    const currentDate = new Date().toLocaleDateString("en-CA");
    const [taskResult, materialResult, inspectionResult, operationsProjectResult] = await Promise.all([
      supabase.from("work_tasks").select("project_id,status,task_type").eq("company_id", membership.companies.id).not("status", "in", '(completed,cancelled)'),
      supabase.from("material_orders").select("project_id,status,task_id").eq("company_id", membership.companies.id).in("status", ["needed", "ordered"]),
      supabase.from("inspections").select("project_id,status,scheduled_date").eq("company_id", membership.companies.id).eq("status", "scheduled").gte("scheduled_date", currentDate),
      supabase.from("projects").select("id,name,address,progress_percent").eq("company_id", membership.companies.id).order("name"),
    ]);
    document.querySelector("#dashboardOpenTasks").textContent = taskResult.error ? "—" : String((taskResult.data || []).length);
    const taskMaterials = (taskResult.data || []).filter((item) => item.task_type === "material");
    const independentOrders = (materialResult.data || []).filter((item) => !item.task_id);
    document.querySelector("#dashboardMaterials").textContent = materialResult.error || taskResult.error ? "—" : String(taskMaterials.length + independentOrders.length);
    document.querySelector("#dashboardInspections").textContent = inspectionResult.error ? "—" : String((inspectionResult.data || []).length);
    const healthGrid = document.querySelector("#projectHealthGrid");
    if (operationsProjectResult.error || taskResult.error || materialResult.error || inspectionResult.error) {
      healthGrid.innerHTML = '<p class="tasks-empty">Project operations will appear after the database upgrade is activated.</p>';
      return;
    }
    const projects = operationsProjectResult.data || [];
    healthGrid.innerHTML = projects.length ? projects.map((project) => {
      const openTasks = (taskResult.data || []).filter((item) => item.project_id === project.id && item.task_type !== "material").length;
      const materials = taskMaterials.filter((item) => item.project_id === project.id).length + independentOrders.filter((item) => item.project_id === project.id).length;
      const inspections = (inspectionResult.data || []).filter((item) => item.project_id === project.id).length;
      return `<article class="project-health-card"><header><div><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.address || "No address")}</small></div><b>${project.progress_percent}%</b></header><i class="health-progress" style="--progress:${project.progress_percent}%"></i><div><span><strong>${openTasks}</strong> Open tasks</span><span><strong>${materials}</strong> Materials</span><span><strong>${inspections}</strong> Inspections</span></div></article>`;
    }).join("") : '<p class="tasks-empty">Create a project to see its operations dashboard.</p>';
  }
  loadOperationsMetrics();
  const views = {
    dashboard: document.querySelector("#dashboardView > .dashboard-content"),
    projects: document.querySelector("#projectsView"),
    reports: document.querySelector("#reportsView"),
    tasks: document.querySelector("#tasksView"),
    schedule: document.querySelector("#scheduleView"),
    materials: document.querySelector("#materialsView"),
    inspections: document.querySelector("#inspectionsView"),
    labor: document.querySelector("#laborView"),
    subcontractors: document.querySelector("#subcontractorsView"),
    files: document.querySelector("#filesView"),
    alerts: document.querySelector("#alertsView"),
    team: document.querySelector("#teamView"),
  };
  const modules = {};
  function navigate(name) {
    if (employeeOnly) name = "labor";
    Object.entries(views).forEach(([key, view]) => { view.hidden = key !== name; });
    let activeNav;
    document.querySelectorAll(".nav-item").forEach((item) => {
      const active = item.getAttribute("href") === `#${name}`;
      item.classList.toggle("is-active", active);
      item.toggleAttribute("aria-current", active);
      if (active) activeNav = item;
    });
    if (activeNav && window.innerWidth <= 900) activeNav.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    modules[name]?.load?.();
  }
  modules.projects = createProjectsModule({
    supabase,
    companyId: membership.companies.id,
    canManage: ["owner_admin", "project_manager"].includes(membership.role),
    canDelete: membership.role === "owner_admin",
    onCountChange: (nextCount) => { document.querySelector("#projectCount").textContent = String(nextCount); },
    onNavigate: navigate,
  });
  modules.reports = createReportsModule({ supabase, session, companyId: membership.companies.id, membership, canManage: ["owner_admin", "project_manager"].includes(membership.role) });
  modules.tasks = createTasksModule({ supabase, companyId: membership.companies.id, canManage: ["owner_admin", "project_manager"].includes(membership.role) });
  const operationsAccess = { supabase, companyId: membership.companies.id, canManage: ["owner_admin", "project_manager"].includes(membership.role) };
  modules.schedule = createScheduleModule(operationsAccess);
  modules.materials = createMaterialsModule(operationsAccess);
  modules.inspections = createInspectionsModule(operationsAccess);
  modules.labor = createLaborModule({ ...operationsAccess, session });
  modules.subcontractors = createSubcontractorsModule(operationsAccess);
  modules.files = createFilesModule(operationsAccess);
  modules.alerts = createAlertsModule(operationsAccess);
  modules.team = createTeamModule({ supabase, session, companyId: membership.companies.id, canManage: ["owner_admin", "project_manager"].includes(membership.role), managerRole: membership.role });
  modules.dashboard = { load: loadOperationsMetrics };
  if (employeeOnly) {
    document.querySelectorAll(".nav-item").forEach((item) => { item.hidden = item.getAttribute("href") !== "#labor"; });
    document.querySelectorAll(".nav-section-label").forEach((label) => { label.hidden = true; });
  } else {
    Promise.all([modules.tasks.load(), modules.inspections.load()]).then(() => Promise.all([loadOperationsMetrics(), modules.alerts.load()]));
  }
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", (event) => { event.preventDefault(); navigate(item.getAttribute("href").slice(1)); }));
  navigate(employeeOnly ? "labor" : (location.hash.slice(1) in views ? location.hash.slice(1) : "dashboard"));
}
