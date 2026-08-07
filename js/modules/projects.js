import { enableAddressAutocomplete } from "../services/google-maps.js";
import { buildProjectTasks, getProjectTemplate } from "../data/construction-template.js";

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

const PROJECT_TYPE_OPTIONS = [
  ["new-construction", "New construction"],
  ["whole-home-remodel", "Whole-home remodel"],
  ["kitchen-remodel", "Kitchen remodel"],
  ["bathroom-remodel", "Bathroom remodel"],
  ["flooring-remodel", "Flooring remodel"],
  ["kitchen-bath-flooring", "Kitchen, bathroom & flooring remodel"],
];

function renderProjectTypeOptions(selectedType) {
  return PROJECT_TYPE_OPTIONS.map(([value, label]) =>
    `<option value="${value}" ${value === selectedType ? "selected" : ""}>${label}</option>`
  ).join("");
}

function renderFileRows(files, canManage) {
  if (!files.length) return '<div class="empty-files">Nothing has been added here yet.</div>';
  return files.map((file) => `<div class="project-file-row">
    <span class="file-type-icon">${getFileIcon(file)}</span>
    <span class="file-details"><strong>${escapeHtml(file.file_name)}</strong><small>${formatFileSize(file.file_size)} · ${new Date(file.created_at).toLocaleDateString()}</small></span>
    <button class="file-action" type="button" data-open-file="${file.id}">Open</button>
    ${canManage ? `<button class="file-action file-delete" type="button" data-delete-file="${file.id}" aria-label="Delete ${escapeHtml(file.file_name)}">Delete</button>` : ""}
  </div>`).join("");
}

export function createProjectsModule({ supabase, companyId, canManage, canDelete, onCountChange, onNavigate }) {
  const projectsView = document.querySelector("#projectsView");
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
  const openPhaseIds = new Set();

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
        getProjectTemplate(project.project_type || "new-construction"),
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
      ${canManage ? `<section class="project-management-panel">
        <div class="project-management-heading"><div><h2>Project settings</h2><p>Edit the project name, job type, or address—or permanently delete this project.</p></div><button class="project-edit-toggle" type="button" data-toggle-project-edit>Edit project</button></div>
        <form class="project-edit-form" data-project-edit-form hidden>
          <label>Project name<input name="projectName" value="${escapeHtml(project.name)}" required></label>
          <label>Job type<select name="projectType" required>${renderProjectTypeOptions(project.project_type || "new-construction")}</select></label>
          <label>Address<input name="projectAddress" value="${escapeHtml(project.address || "")}" autocomplete="street-address"></label>
          <div class="project-edit-actions"><button class="primary-button" type="submit">Save changes</button><button class="secondary-button" type="button" data-cancel-project-edit>Cancel</button></div>
        </form>
        ${canDelete ? `<div class="project-danger-zone"><div><strong>Delete project</strong><small>This permanently deletes its phases, tasks, reports connection, and uploaded files.</small></div><button type="button" data-delete-project>Delete project</button></div>` : ""}
      </section>` : ""}
      <div class="phase-list">${phases.map((phase) => {
        const tasks = [...(phase.project_tasks || [])].sort((a, b) => a.sort_order - b.sort_order);
        return `<details class="phase-group" data-phase-group="${phase.id}" ${openPhaseIds.has(phase.id) ? "open" : ""}>
            <summary><span>${escapeHtml(phase.name)}</span><span class="phase-summary-progress"><i style="--progress:${phase.progress_percent}%"></i><strong>${phase.progress_percent}%</strong></span></summary>
            ${canManage && tasks.length ? `<div class="phase-bulk-progress"><label>Set entire phase</label><input type="range" min="0" max="100" step="5" value="${phase.progress_percent}" data-phase-progress="${phase.id}"><strong>${phase.progress_percent}%</strong><button type="button" data-complete-phase="${phase.id}">Mark 100%</button></div>` : ""}
            <div class="task-list">${tasks.length ? tasks.map((task) => `<div class="task-row">
              <div class="task-info"><strong>${escapeHtml(task.name)}</strong><span>${escapeHtml(task.responsible_trade)} · Typical ${task.duration_days} ${task.duration_days === 1 ? "day" : "days"}</span></div>
              <input type="range" min="0" max="100" step="5" value="${task.progress_percent}" data-task-id="${task.id}" aria-label="${escapeHtml(task.name)} progress" ${canManage ? "" : "disabled"}>
              <span class="task-value">${task.progress_percent}%</span>
            </div>`).join("") : '<p class="no-tasks">Detailed tasks must be added to this phase.</p>'}</div>
          </details>`;
      }).join("")}</div>
      <section class="project-files-section">
        <div class="files-heading"><div><h2>Files &amp; Plans</h2><p>Photos, plans, PDFs, and project documents</p></div><strong>${files.length} ${files.length === 1 ? "file" : "files"}</strong></div>
        ${canManage ? `<div class="file-upload-grid">
          <label class="file-upload-control"><input type="file" multiple accept="image/*" data-file-category="photos"><span>＋ Add photos</span><small>Camera or photo library</small></label>
          <label class="file-upload-control"><input type="file" multiple accept="image/*,.pdf,.dwg,.dxf" data-file-category="plans"><span>＋ Add plans</span><small>PDF, DWG, DXF, or image</small></label>
          <label class="file-upload-control"><input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" data-file-category="documents"><span>＋ Add documents</span><small>PDF, Word, Excel, or text</small></label>
        </div><p id="fileUploadStatus" class="file-upload-status" hidden></p>` : ""}
        <div class="file-category-groups">
          <section class="file-category"><h3>Photos</h3><div class="project-files-list">${renderFileRows(files.filter(({ category }) => category === "photos"), canManage)}</div></section>
          <section class="file-category"><h3>Plans</h3><div class="project-files-list">${renderFileRows(files.filter(({ category }) => category === "plans"), canManage)}</div></section>
          <section class="file-category"><h3>Documents</h3><div class="project-files-list">${renderFileRows(files.filter(({ category }) => !["photos", "plans"].includes(category)), canManage)}</div></section>
        </div>
      </section>
    </article>`;

    list.querySelectorAll("input[data-task-id]").forEach((input) => {
      input.addEventListener("input", () => { input.nextElementSibling.textContent = `${input.value}%`; });
      input.addEventListener("change", async () => {
        const { error } = await supabase.from("project_tasks").update({ progress_percent: Number(input.value) }).eq("id", input.dataset.taskId);
        if (error) showError("Task progress could not be saved."); else loadProjects();
      });
    });
    list.querySelectorAll("[data-phase-group]").forEach((details) => {
      details.addEventListener("toggle", () => { if (details.open) openPhaseIds.add(details.dataset.phaseGroup); else openPhaseIds.delete(details.dataset.phaseGroup); });
    });
    list.querySelectorAll("[data-phase-progress]").forEach((input) => {
      input.addEventListener("input", () => { input.nextElementSibling.textContent = `${input.value}%`; });
      input.addEventListener("change", () => updateWholePhase(project, input.dataset.phaseProgress, Number(input.value)));
    });
    list.querySelectorAll("[data-complete-phase]").forEach((button) => {
      button.addEventListener("click", () => updateWholePhase(project, button.dataset.completePhase, 100));
    });

    list.querySelectorAll("[data-file-category]").forEach((fileInput) => {
      fileInput.addEventListener("change", () => uploadProjectFiles(project, [...fileInput.files], fileInput.dataset.fileCategory));
    });
    list.querySelectorAll("[data-open-file]").forEach((button) => {
      button.addEventListener("click", () => openProjectFile(files.find(({ id }) => id === button.dataset.openFile)));
    });
    list.querySelectorAll("[data-delete-file]").forEach((button) => {
      button.addEventListener("click", () => deleteProjectFile(files.find(({ id }) => id === button.dataset.deleteFile)));
    });
    const editForm = list.querySelector("[data-project-edit-form]");
    list.querySelector("[data-toggle-project-edit]")?.addEventListener("click", () => { editForm.hidden = !editForm.hidden; });
    list.querySelector("[data-cancel-project-edit]")?.addEventListener("click", () => { editForm.hidden = true; });
    editForm?.addEventListener("submit", (event) => updateProject(event, project));
    list.querySelector("[data-delete-project]")?.addEventListener("click", () => deleteProject(project));
  }

  async function updateProject(event, project) {
    event.preventDefault();
    message.hidden = true;
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    const name = event.currentTarget.elements.projectName.value.trim();
    const address = event.currentTarget.elements.projectAddress.value.trim();
    const projectType = event.currentTarget.elements.projectType.value;
    const previousType = project.project_type || "new-construction";
    if (!name) return showError("Project name is required.");
    if (projectType !== previousType && !window.confirm("Changing the job type will replace the current phases and tasks with the new job plan. Existing phase progress will be reset. Continue?")) return;
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
    const { error } = await supabase.from("projects").update({ name, address, project_type: projectType }).eq("id", project.id);
    if (error) {
      submitButton.disabled = false;
      submitButton.textContent = "Save changes";
      return showError(`The project could not be updated: ${error.message}`);
    }
    if (projectType !== previousType) {
      const { error: deleteError } = await supabase.from("project_phases").delete().eq("project_id", project.id);
      if (deleteError) return showError(`The project was updated, but its old plan could not be replaced: ${deleteError.message}`);
      const template = getProjectTemplate(projectType);
      const phases = template.map(({ phase: phaseName }, index) => ({ project_id: project.id, name: phaseName, sort_order: index + 1, weight: 1 }));
      const { data: createdPhases, error: phaseError } = await supabase.from("project_phases").insert(phases).select("id, name");
      if (phaseError) return showError(`The job type changed, but its new phases could not be added: ${phaseError.message}`);
      const { error: taskError } = await supabase.from("project_tasks").insert(buildProjectTasks(createdPhases || [], template));
      if (taskError) return showError(`The new phases were added, but their tasks could not be added: ${taskError.message}`);
      openPhaseIds.clear();
    }
    await loadProjects();
  }

  async function deleteProject(project) {
    if (!canDelete) return showError("Only an Owner / Admin can delete a project.");
    const confirmation = window.prompt(`This will permanently delete "${project.name}" and all of its information.\n\nType DELETE to confirm:`);
    if (confirmation !== "DELETE") return;
    message.hidden = true;
    const deleteButton = list.querySelector("[data-delete-project]");
    if (deleteButton) { deleteButton.disabled = true; deleteButton.textContent = "Deleting..."; }
    const storagePaths = (project.project_files || []).map(({ storage_path: storagePath }) => storagePath).filter(Boolean);
    if (storagePaths.length) {
      const { error: storageError } = await supabase.storage.from("project-files").remove(storagePaths);
      if (storageError) {
        if (deleteButton) { deleteButton.disabled = false; deleteButton.textContent = "Delete project"; }
        return showError(`Project files could not be deleted: ${storageError.message}`);
      }
    }
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) {
      if (deleteButton) { deleteButton.disabled = false; deleteButton.textContent = "Delete project"; }
      return showError(`The project could not be deleted: ${error.message}`);
    }
    selectedProjectId = null;
    await loadProjects();
  }

  async function updateWholePhase(project, phaseId, progressPercent) {
    openPhaseIds.add(phaseId);
    const phase = (project.project_phases || []).find(({ id }) => id === phaseId);
    const taskIds = (phase?.project_tasks || []).map(({ id }) => id);
    if (!taskIds.length) return;
    const { error } = await supabase.from("project_tasks").update({ progress_percent: progressPercent }).in("id", taskIds);
    if (error) return showError("The phase progress could not be saved.");
    await loadProjects();
  }

  async function uploadProjectFiles(project, files, category) {
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
        status.textContent = `${file.name} could not be uploaded: ${uploadError.message}`;
        status.classList.add("is-error");
        return;
      }
      const { error: metadataError } = await supabase.from("project_files").insert({
        project_id: project.id, storage_path: storagePath, file_name: file.name,
        mime_type: file.type || null, file_size: file.size, category,
      });
      if (metadataError) {
        await supabase.storage.from("project-files").remove([storagePath]);
        status.textContent = `${file.name} could not be connected to the project: ${metadataError.message}`;
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
    const projectType = document.querySelector("#projectType").value;
    if (!name || !canManage) return;
    const { data: project, error } = await supabase.from("projects").insert({ company_id: companyId, name, address, project_type: projectType }).select().single();
    if (error) return showError("The project could not be created.");
    const template = getProjectTemplate(projectType);
    const phases = template.map(({ phase: phaseName }, index) => ({ project_id: project.id, name: phaseName, sort_order: index + 1, weight: 1 }));
    const { data: createdPhases, error: phaseError } = await supabase.from("project_phases").insert(phases).select("id, name");
    if (phaseError) return showError("The project was created, but its phases could not be added.");
    const { error: taskError } = await supabase.from("project_tasks").insert(buildProjectTasks(createdPhases || [], template));
    if (taskError) return showError("The phases were created, but their detailed tasks could not be added.");
    form.reset();
    loadProjects();
  });

  backButton.addEventListener("click", () => {
    if (selectedProjectId) showProjectList(); else onNavigate("dashboard");
  });
  if (!canManage) document.querySelector(".project-form-card").hidden = true;
  else enableAddressAutocomplete(addressInput).catch(() => {
    addressInput.placeholder = "Enter the full project address";
  });
  return { load: () => { selectedProjectId = null; return loadProjects(); } };
}
