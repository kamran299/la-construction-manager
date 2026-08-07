import { enableAddressAutocomplete } from "../services/google-maps.js";

const DEFAULT_PHASES = [
  "Preconstruction", "Foundation", "Framing", "MEP Rough-in",
  "Insulation & Drywall", "Finishes", "Final Inspection", "Closeout",
];

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

export function createProjectsModule({ supabase, companyId, canManage, onCountChange }) {
  const dashboardContent = document.querySelector("#dashboardView > .dashboard-content");
  const projectsView = document.querySelector("#projectsView");
  const navItems = document.querySelectorAll(".nav-item");
  const list = document.querySelector("#projectsList");
  const form = document.querySelector("#projectForm");
  const addressInput = document.querySelector("#projectAddress");
  const message = document.querySelector("#projectsMessage");

  function navigate(showProjects) {
    dashboardContent.hidden = showProjects;
    projectsView.hidden = !showProjects;
    navItems.forEach((item) => item.classList.toggle("is-active", item.id === (showProjects ? "projectsNav" : "")));
    document.querySelector('.nav-item[href="#dashboard"]').classList.toggle("is-active", !showProjects);
    if (showProjects) loadProjects();
  }

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("*, project_phases(*)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) return showError("Projects could not be loaded.");
    render(data || []);
    onCountChange(data?.length || 0);
  }

  function render(projects) {
    if (!projects.length) {
      list.innerHTML = '<div class="empty-projects">No projects yet. Create the first project to add its construction phases.</div>';
      return;
    }
    list.innerHTML = projects.map((project) => {
      const phases = [...(project.project_phases || [])].sort((a, b) => a.sort_order - b.sort_order);
      return `<article class="project-card">
        <div class="project-card-header"><div><h2>${escapeHtml(project.name)}</h2><div class="project-address">${escapeHtml(project.address || "No address")}</div></div><div class="overall-progress">${project.progress_percent}%</div></div>
        <div class="phase-list">${phases.map((phase) => `<div class="phase-row">
          <label for="phase-${phase.id}">${escapeHtml(phase.name)}</label>
          <input id="phase-${phase.id}" type="range" min="0" max="100" step="5" value="${phase.progress_percent}" data-phase-id="${phase.id}" ${canManage ? "" : "disabled"}>
          <span class="phase-value">${phase.progress_percent}%</span>
        </div>`).join("")}</div>
      </article>`;
    }).join("");

    list.querySelectorAll("input[type=range]").forEach((input) => {
      input.addEventListener("input", () => { input.nextElementSibling.textContent = `${input.value}%`; });
      input.addEventListener("change", async () => {
        const { error } = await supabase.from("project_phases").update({ progress_percent: Number(input.value) }).eq("id", input.dataset.phaseId);
        if (error) showError("Phase progress could not be saved."); else loadProjects();
      });
    });
  }

  function showError(text) { message.textContent = text; message.hidden = false; }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.hidden = true;
    const name = document.querySelector("#projectName").value.trim();
    const address = addressInput.value.trim();
    if (!name || !canManage) return;
    const { data: project, error } = await supabase.from("projects").insert({ company_id: companyId, name, address }).select().single();
    if (error) return showError("The project could not be created.");
    const phases = DEFAULT_PHASES.map((phaseName, index) => ({ project_id: project.id, name: phaseName, sort_order: index + 1, weight: 1 }));
    const { error: phaseError } = await supabase.from("project_phases").insert(phases);
    if (phaseError) return showError("The project was created, but its phases could not be added.");
    form.reset();
    loadProjects();
  });

  document.querySelector("#projectsNav").addEventListener("click", (event) => { event.preventDefault(); navigate(true); });
  document.querySelector("#backToDashboard").addEventListener("click", () => navigate(false));
  if (!canManage) document.querySelector(".project-form-card").hidden = true;
  else enableAddressAutocomplete(addressInput).catch(() => {
    addressInput.placeholder = "Enter the full project address";
  });
  return { loadProjects };
}
