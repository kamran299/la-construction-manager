function asciiText(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfString(value) {
  return asciiText(value).replace(/([\\()])/g, "\\$1");
}

function wrapText(value, maxCharacters = 92) {
  const words = asciiText(value).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((originalWord) => {
    let word = originalWord;
    if (current && `${current} ${word}`.length <= maxCharacters) {
      current = `${current} ${word}`;
      return;
    }
    if (current) lines.push(current);
    current = "";
    while (word.length > maxCharacters) {
      lines.push(word.slice(0, maxCharacters));
      word = word.slice(maxCharacters);
    }
    current = word;
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function addText(commands, value, x, y, size = 9, font = "F1", color = [0.09, 0.13, 0.2]) {
  const [red, green, blue] = color;
  commands.push(`${red} ${green} ${blue} rg BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfString(value)}) Tj ET`);
}

function fillRect(commands, x, y, width, height, color) {
  const [red, green, blue] = color;
  commands.push(`q ${red} ${green} ${blue} rg ${x} ${y} ${width} ${height} re f Q`);
}

function drawLine(commands, x1, y1, x2, y2, color = [0.86, 0.88, 0.91], width = 0.6) {
  const [red, green, blue] = color;
  commands.push(`q ${red} ${green} ${blue} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q`);
}

function taskStatusLabel(status) {
  return status === "in_progress" ? "In progress" : "Open";
}

function groupByProject(items) {
  const groups = new Map();
  items.forEach((task) => {
    const project = asciiText(task.project || "General") || "General";
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(task);
  });
  return groups;
}

function assemblePdf(pageStreams) {
  const encoder = new TextEncoder();
  const objects = [null, "", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"];
  const pageIds = [];

  pageStreams.forEach((commands) => {
    const pageId = objects.length;
    const contentId = pageId + 1;
    const stream = `${commands.join("\n")}\n`;
    const streamLength = encoder.encode(stream).length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${streamLength} >>\nstream\n${stream}endstream`);
    pageIds.push(pageId);
  });

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  const chunks = [];
  const offsets = new Array(objects.length).fill(0);
  let byteLength = 0;
  const append = (value) => {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  append("%PDF-1.4\n%L&A\n");
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = byteLength;
    append(`${id} 0 obj\n${objects[id]}\nendobj\n`);
  }
  const xrefOffset = byteLength;
  append(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < objects.length; id += 1) append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}

export function buildTasksPdfBlob(tasks, generatedAt = new Date()) {
  const orange = [0.91, 0.36, 0.08];
  const navy = [0.09, 0.13, 0.2];
  const gray = [0.4, 0.44, 0.52];
  const lightGray = [0.95, 0.96, 0.97];
  const sorted = (items) => [...items].sort((left, right) => String(left.project || "General").localeCompare(String(right.project || "General")) || String(left.due_date || left.source_date || "").localeCompare(String(right.due_date || right.source_date || "")));
  const openTasks = sorted(tasks.filter((task) => task.status !== "completed" && !task.is_material));
  const materials = sorted(tasks.filter((task) => task.status !== "completed" && task.is_material));
  const dateLabel = generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const pages = [];
  let commands = [];
  let y = 0;

  const addProjectHeading = (project, continued = false) => {
    fillRect(commands, 36, y - 18, 540, 18, lightGray);
    addText(commands, continued ? `${project} - continued` : project, 43, y - 13, 9, "F2", navy);
    y -= 23;
  };

  const startPage = (continued = false, sectionTitle = "") => {
    commands = [];
    pages.push(commands);
    addText(commands, "L&A", 36, 756, 16, "F2", orange);
    addText(commands, "Construction Manager", 76, 756, 11, "F2", navy);
    addText(commands, "Task Manager", 76, 744, 8, "F1", gray);
    addText(commands, dateLabel, Math.max(390, 576 - dateLabel.length * 4.2), 749, 8, "F1", gray);
    drawLine(commands, 36, 735, 576, 735, orange, 2.4);
    addText(commands, continued ? "Tasks - continued" : "Tasks", 36, 706, continued ? 16 : 20, "F2", navy);
    if (!continued) {
      fillRect(commands, 36, 645, 255, 36, lightGray);
      fillRect(commands, 306, 645, 270, 36, lightGray);
      addText(commands, "Open work", 47, 659, 8, "F1", gray);
      addText(commands, openTasks.length, 262, 657, 13, "F2", orange);
      addText(commands, "Materials to order", 317, 659, 8, "F1", gray);
      addText(commands, materials.length, 547, 657, 13, "F2", orange);
      y = 625;
    } else {
      y = 680;
      if (sectionTitle) {
        addText(commands, `${sectionTitle} - continued`, 36, y, 10, "F2", orange);
        y -= 20;
      }
    }
  };

  const renderSection = (title, subtitle, items) => {
    if (y < 95) startPage(true, title);
    addText(commands, subtitle.toUpperCase(), 36, y, 7.2, "F2", orange);
    y -= 14;
    addText(commands, title, 36, y, 13, "F2", navy);
    drawLine(commands, 36, y - 6, 576, y - 6, orange, 1.5);
    y -= 22;

    if (!items.length) {
      addText(commands, title === "Work to do" ? "No open work tasks were found." : "No materials need to be ordered.", 43, y, 9, "F1", gray);
      y -= 24;
      return;
    }

    groupByProject(items).forEach((projectTasks, project) => {
      const firstTaskLines = wrapText(projectTasks[0]?.details || "Task");
      const firstTaskHeight = firstTaskLines.length * 11 + 21;
      if (y - firstTaskHeight - 23 < 42) startPage(true, title);
      addProjectHeading(project);

      projectTasks.forEach((task) => {
        const detailLines = wrapText(task.details || "Untitled task");
        const date = task.due_date ? `Due ${task.due_date}` : `From ${task.source_date || task.latest_date || "Unknown"}`;
        const assignment = task.assigned_to || "Unassigned";
        const metaLines = wrapText(`${taskStatusLabel(task.status)} | ${assignment} | ${date}`, 116);
        const taskHeight = detailLines.length * 11 + metaLines.length * 9 + 7;
        if (y - taskHeight < 42) {
          startPage(true, title);
          addProjectHeading(project, true);
        }
        detailLines.forEach((line, index) => {
          addText(commands, `${index === 0 ? "- " : "  "}${line}`, 43, y, 8.8, "F1", navy);
          y -= 11;
        });
        metaLines.forEach((line) => {
          addText(commands, line, 51, y, 7.1, "F1", gray);
          y -= 9;
        });
        drawLine(commands, 43, y + 3, 576, y + 3);
        y -= 7;
      });
      y -= 3;
    });
  };

  startPage();
  renderSection("Work to do", "Action list", openTasks);
  renderSection("Materials to order", "Purchasing", materials);
  pages.forEach((page, index) => {
    drawLine(page, 36, 31, 576, 31);
    addText(page, "Generated from L&A Construction Manager", 36, 18, 7, "F1", gray);
    addText(page, `Page ${index + 1} of ${pages.length}`, 525, 18, 7, "F1", gray);
  });
  return assemblePdf(pages);
}

export function downloadTasksPdf(tasks, generatedAt = new Date()) {
  const blob = buildTasksPdfBlob(tasks, generatedAt);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const year = generatedAt.getFullYear();
  const month = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const day = String(generatedAt.getDate()).padStart(2, "0");
  link.href = url;
  link.download = `L-A-Tasks-${year}-${month}-${day}.pdf`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return blob;
}
