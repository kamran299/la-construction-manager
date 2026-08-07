import { enableAddressAutocomplete } from "../services/google-maps.js";
import { DEFAULT_PHASES, buildProjectTasks } from "../data/construction-template.js";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(file) {
  if ((file.mime_type || "").startsWith("image/")) return "▧";
  if (file.mime_type === "application/pdf") return "PDF";
  return "DOC";
}

export function createProjectsModule({ supabase, companyId, canManage, onCountChange }) {
  const dashboardContent = document.querySelector("#dashboardView > .dashboard-content");
  const projectsView = document.querySelector("#projectsView");
  const navItems = document.querySelectorAll(".nav-item");
  const list = document.querySelector("#projectsList");
  const form = document.querySelector("#projectForm");
  const addressInput = document.querySelector("#projectAddress");
  const message = document.querySelector("#projectsMessage");
  const projectsGrid = projectsView.querySelector(".projects-grid");
  const formCard = projectsView.querySelector(".project-form-card");
  const title = document.querySelector("#projectsTitle");
  const backButton = document.querySelector("#backToDashboard");
  let isRepairingTasks = false;
  let loadedProjects = [];
  let selectedProjectId = null;

  function navigate(showProjects) {
    dashboardContent.hidden = showProjects;
    projectsView.hidden = !showProjects;
    navItems.forEach((item) => item.classList.toggle("is-active", item.id === (showProjects ? "projectsNav" : "")));
    const dashboardNav = document.querySelector('.nav-item[href="#dashboard"]');
    dashboardNav.classList.toggle("is-active", !showProjects);
    dashboardNav.toggleAttribute("aria-current", !showProjects);
    document.querySelector("#projectsNav").toggleAttribute("aria-current", showProjects);
    if (showProjects) {
      selectedProjectId = null;
      loadProjects();
    }
  }

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("*, project_phases(*, project_tasks(*))")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) return showError("Projects could not be loaded.");
    const projects = data || [];
    if (projects.length) {
      const { data: files } = await supabase
        .from("project_files")
        .select("*")
        .in("project_id", projects.map(({ id }) => id))
        .order("created_at", { ascending: false });
      projects.forEach((project) => {
        project.project_files = (files || []).filter(({ project_id: projectId }) => projectId === project.id);
      });
    }
    if (canManage && !isRepairingTasks) {
      const missingTasks = projects.flatMap((project) => buildProjectTasks(
        (project.project_phases || []).filter((phase) => !(phase.project_tasks || []).length),
      ));
      if (missingTasks.length) {
        isRepairingTasks = true;
        const { error: repairError } = await supabase.from("project_tasks").insert(missingTasks);
        isRepairingTasks = false;
        if (repairError) return showError("Detailed construction tasks could not be added.");
        return loadProjects();
      }
    }
    loadedProjects = projects;
    const selectedProject = projects.find(({ id }) => id === selectedProjectId);
    if (selectedProject) renderProject(selectedProject); else renderProjectList(projects);
    onCountChange(projects.length);
  }

  function showProjectList() {
    selectedProjectId = null;
    renderProjectList(loadedProjects);
  }

  function renderProjectList(projects) {
    title.textContent = "Projects";
    backButton.textContent = "Dashboard";
    formCard.hidden = !canManage;
    projectsGrid.classList.remove("project-detail-mode");
    if (!projects.length) {
      list.innerHTML = '<div class="empty-projects">No projects yet. Create the first project to add its construction phases.</div>';
      return;
    }
    const sortedProjects = [...projects].sort((a, b) => {
      const addressA = (a.address || "").trim();
      const addressB = (b.address || "").trim();
      if (!addressA && addressB) return 1;
      if (addressA && !addressB) return -1;
      return addressA.localeCompare(addressB, "en", { numeric: true, sensitivity: "base" });
    });
    list.innerHTML = sortedProjects.map((project) => {
      const phases = [...(project.project_phases || [])].sort((a, b) => a.sort_order - b.sort_order);
      return `<button class="project-summary-card" type="button" data-project-id="${project.id}">
        <span class="project-card-header"><span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.address || "No address")}</small></span><b>${project.progress_percent}%</b></span>
        <span class="project-phase-preview">${phases.map((phase) => `<span><small>${escapeHtml(phase.name)}</small><i style="--progress:${phase.progress_percent}%"></i></span>`).join("")}</span>
        <span class="open-project-label">Open project <span aria-hidden="true">→</span></span>
      </button>`;
    }).join("");

    list.querySelectorAll("[data-project-id]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedProjectId = button.dataset.projectId;
        renderProject(sortedProjects.find(({ id }) => id === selectedProjectId));
      });
    });
  }

  function renderProject(project) {
    if (!project) return showProjectList();
    title.textContent = project.name;
    backButton.textContent = "Back to projects";
    formCard.hidden = true;
    projectsGrid.classList.add("project-detail-mode");
    const phases = [...(project.project_phases || [])].sort((a, b) => a.sort_order - b.sort_order);
    const files = project.project_files || [];
    list.innerHTML = `<article class="project-card project-detail-card">
      <div class="project-card-header"><div><h2>Construction plan</h2><div class="project-address">${escapeHtml(project.address || "No address")}</div></div><div class="overall-progress">${project.progress_percent}%</div></div>
      <div class="phase-list">${phases.map((phase) => {
        const tasks = [...(phase.project_tasks || [])].sort((a, b) => a.sort_order - b.sort_order);
        return `<details class="phase-group">
            <summary><span>${escapeHtml(phase.name)}</span><span class="phase-summary-progress"><i style="--progress:${phase.progress_percent}%"></i><strong>${phase.progress_percent}%</strong></span></summary>
            <div class="task-list">${tasks.length ? tasks.map((task) => `<div class="task-row">
              <div class="task-info"><strong>${escapeHtml(task.name)}</strong><span>${escapeHtml(task.responsible_trade)} · Typical ${task.duration_days} ${task.duration_days === 1 ? "day" : "days"}</span></div>
              <input type="range" min="0" max="100" step="5" value="${task.progress_percent}" data-task-id="${task.id}" aria-label="${escapeHtml(task.name)} progress" ${canManage ? "" : "disabled"}>
              <span class="task-value">${task.progress_percent}%</span>
            </div>`).join("") : '<p class="no-tasks">Detailed tasks must be added to this phase.</p>'}</div>
          </details>`;
      }).join("")}</div>
      <section class="project-files-section">
        <div class="files-heading"><div><h2>Files &amp; Plans</h2><p>Photos, plans, PDFs, and project documents</p></div><strong>${files.length} ${files.length === 1 ? "file" : "files"}</strong></div>
        ${canManage ? `<label class="file-upload-control"><input id="projectFileInput" type="file" multiple accept="image/*,.pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.csv,.txt"><span>＋ Add files or photos</span><small>Maximum 50 MB per file</small></label><p id="fileUploadStatus" class="file-upload-status" hidden></p>` : ""}
        <div class="project-files-list">${files.length ? files.map((file) => `<div class="project-file-row">
          <span class="file-type-icon">${getFileIcon(file)}</span>
          <span class="file-details"><strong>${escapeHtml(file.file_name)}</strong><small>${formatFileSize(file.file_size)} · ${new Date(file.created_at).toLocaleDateString()}</small></span>
          <button class="file-action" type="button" data-open-file="${file.id}">Open</button>
          ${canManage ? `<button class="file-action file-delete" type="button" data-delete-file="${file.id}" aria-label="Delete ${escapeHtml(file.file_name)}">Delete</button>` : ""}
        </div>`).join("") : '<div class="empty-files">No files have been added to this project yet.</div>'}</div>
      </section>
    </article>`;

    list.querySelectorAll("input[data-task-id]").forEach((input) => {
      input.addEventListener("input", () => { input.nextElementSibling.textContent = `${input.value}%`; });
      input.addEventListener("change", async () => {
        const { error } = await supabase.from("project_tasks").update({ progress_percent: Number(input.value) }).eq("id", input.dataset.taskId);
        if (error) showError("Task progress could not be saved."); else loadProjects();
      });
    });

    const fileInput = document.querySelector("#projectFileInput");
    if (fileInput) fileInput.addEventListener("change", () => uploadProjectFiles(project, [...fileInput.files]));
    list.querySelectorAll("[data-open-file]").forEach((button) => {
      button.addEventListener("click", () => openProjectFile(files.find(({ id }) => id === button.dataset.openFile)));
    });
    list.querySelectorAll("[data-delete-file]").forEach((button) => {
      button.addEventListener("click", () => deleteProjectFile(files.find(({ id }) => id === button.dataset.deleteFile)));
    });
  }

  async function uploadProjectFiles(project, files) {
    if (!files.length) return;
    const status = document.querySelector("#fileUploadStatus");
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = `Uploading ${files.length} ${files.length === 1 ? "file" : "files"}...`;
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        status.textContent = `${file.name} is larger than 50 MB.`;
        status.classList.add("is-error");
        return;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const storagePath = `${companyId}/${project.id}/${uniqueId}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("project-files").upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) {
        status.textContent = `${file.name} could not be uploaded.`;
        status.classList.add("is-error");
        return;
      }
      const { error: metadataError } = await supabase.from("project_files").insert({
        project_id: project.id, storage_path: storagePath, file_name: file.name,
        mime_type: file.type || null, file_size: file.size,
      });
      if (metadataError) {
        await supabase.storage.from("project-files").remove([storagePath]);
        status.textContent = `${file.name} could not be connected to the project.`;
        status.classList.add("is-error");
        return;
      }
    }
    await loadProjects();
  }

  async function openProjectFile(file) {
    if (!file) return;
    const newTab = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("project-files").createSignedUrl(file.storage_path, 300);
    if (error || !data?.signedUrl) {
      newTab?.close();
      showError("The file could not be opened.");
      return;
    }
    if (newTab) newTab.location = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  async function deleteProjectFile(file) {
    if (!file || !window.confirm(`Delete ${file.file_name}?`)) return;
    const { error: storageError } = await supabase.storage.from("project-files").remove([file.storage_path]);
    if (storageError) return showError("The stored file could not be deleted.");
    const { error } = await supabase.from("project_files").delete().eq("id", file.id);
    if (error) return showError("The file record could not be deleted.");
    await loadProjects();
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
    const { data: createdPhases, error: phaseError } = await supabase.from("project_phases").insert(phases).select("id, name");
    if (phaseError) return showError("The project was created, but its phases could not be added.");
    const { error: taskError } = await supabase.from("project_tasks").insert(buildProjectTasks(createdPhases || []));
    if (taskError) return showError("The phases were created, but their detailed tasks could not be added.");
    form.reset();
    loadProjects();
  });

  document.querySelector("#projectsNav").addEventListener("click", (event) => { event.preventDefault(); navigate(true); });
  document.querySelector('.nav-item[href="#dashboard"]').addEventListener("click", (event) => { event.preventDefault(); navigate(false); });
  backButton.addEventListener("click", () => {
    if (selectedProjectId) showProjectList(); else navigate(false);
  });
  if (!canManage) document.querySelector(".project-form-card").hidden = true;
  else enableAddressAutocomplete(addressInput).catch(() => {
    addressInput.placeholder = "Enter the full project address";
  });
  return { loadProjects };
}
