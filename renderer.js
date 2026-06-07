const TAG_OPTIONS = ["構造", "建築", "電気", "機械", "外構", "内装", "仕上", "防災", "家具", "その他"];
const PRIORITY_OPTIONS = ["要確認", "是正", "保留", "完了", "情報"];

const state = {
  tools: null,
  settings: null,
  metadata: null,
  outputDirectory: "",
  frames: [],
  activeFramePath: "",
  extracting: false,
  saveTimer: null,
  filters: {
    tag: "",
    priority: "",
  },
};

const els = {
  toolStatus: document.querySelector("#toolStatus"),
  versionBadge: document.querySelector("#versionBadge"),
  dropZone: document.querySelector("#dropZone"),
  selectVideoButton: document.querySelector("#selectVideoButton"),
  errorBox: document.querySelector("#errorBox"),
  noticeBox: document.querySelector("#noticeBox"),
  fileStatus: document.querySelector("#fileStatus"),
  infoName: document.querySelector("#infoName"),
  infoSize: document.querySelector("#infoSize"),
  infoDuration: document.querySelector("#infoDuration"),
  infoResolution: document.querySelector("#infoResolution"),
  infoFrameRate: document.querySelector("#infoFrameRate"),
  infoCodec: document.querySelector("#infoCodec"),
  intervalSelect: document.querySelector("#intervalSelect"),
  customIntervalField: document.querySelector("#customIntervalField"),
  customIntervalInput: document.querySelector("#customIntervalInput"),
  outputDirectoryText: document.querySelector("#outputDirectoryText"),
  selectOutputButton: document.querySelector("#selectOutputButton"),
  extractButton: document.querySelector("#extractButton"),
  openOutputButton: document.querySelector("#openOutputButton"),
  runStatus: document.querySelector("#runStatus"),
  progressBar: document.querySelector("#progressBar"),
  percentText: document.querySelector("#percentText"),
  projectName: document.querySelector("#projectName"),
  shootingDate: document.querySelector("#shootingDate"),
  photographer: document.querySelector("#photographer"),
  location: document.querySelector("#location"),
  memo: document.querySelector("#memo"),
  saveProjectButton: document.querySelector("#saveProjectButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  exportPptxButton: document.querySelector("#exportPptxButton"),
  frameCount: document.querySelector("#frameCount"),
  selectAllFrames: document.querySelector("#selectAllFrames"),
  clearFrameSelection: document.querySelector("#clearFrameSelection"),
  copySelectedButton: document.querySelector("#copySelectedButton"),
  frameGrid: document.querySelector("#frameGrid"),
  filterTag: document.querySelector("#filterTag"),
  filterPriority: document.querySelector("#filterPriority"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  activeFrameName: document.querySelector("#activeFrameName"),
  reviewPriority: document.querySelector("#reviewPriority"),
  reviewTags: document.querySelector("#reviewTags"),
  reviewComment: document.querySelector("#reviewComment"),
  reviewFloor: document.querySelector("#reviewFloor"),
  reviewGrid: document.querySelector("#reviewGrid"),
  reviewRoom: document.querySelector("#reviewRoom"),
};

init();

async function init() {
  populateReviewControls();
  bindEvents();
  await renderVersion();
  await restoreSettings();
  await checkTools();
  window.siteLens.onProgress(updateProgress);
}

function populateReviewControls() {
  els.filterTag.innerHTML = '<option value="">タグすべて</option>' + TAG_OPTIONS.map((tag) => `<option value="${tag}">${tag}</option>`).join("");
  els.filterPriority.innerHTML = '<option value="">優先度すべて</option>' + PRIORITY_OPTIONS.map((priority) => `<option value="${priority}">${priority}</option>`).join("");
  els.reviewPriority.innerHTML = PRIORITY_OPTIONS.map((priority) => `<option value="${priority}">${priority}</option>`).join("");
  els.reviewTags.innerHTML = TAG_OPTIONS.map((tag) => `<label><input type="checkbox" value="${tag}"><span>${tag}</span></label>`).join("");
}

function bindEvents() {
  els.selectVideoButton.addEventListener("click", selectVideo);
  els.selectOutputButton.addEventListener("click", selectOutputDirectory);
  els.extractButton.addEventListener("click", extractFrames);
  els.openOutputButton.addEventListener("click", openOutputDirectory);
  els.saveProjectButton.addEventListener("click", saveProject);
  els.exportCsvButton.addEventListener("click", exportReviewCsv);
  els.exportPptxButton.addEventListener("click", exportReviewPptx);
  els.copySelectedButton.addEventListener("click", copySelectedFrames);
  els.selectAllFrames.addEventListener("click", () => setFrameSelection(true));
  els.clearFrameSelection.addEventListener("click", () => setFrameSelection(false));
  els.clearFiltersButton.addEventListener("click", clearFilters);

  els.intervalSelect.addEventListener("change", () => {
    updateIntervalControls();
    scheduleSaveSettings();
  });
  els.customIntervalInput.addEventListener("input", scheduleSaveSettings);

  [els.projectName, els.shootingDate, els.photographer, els.location, els.memo].forEach((input) => {
    input.addEventListener("input", scheduleSaveSettings);
  });

  [els.filterTag, els.filterPriority].forEach((input) => {
    input.addEventListener("change", () => {
      state.filters.tag = els.filterTag.value;
      state.filters.priority = els.filterPriority.value;
      renderFrames();
      scheduleSaveSettings();
    });
  });

  els.reviewPriority.addEventListener("change", updateActiveFrameReview);
  els.reviewComment.addEventListener("input", updateActiveFrameReview);
  els.reviewFloor.addEventListener("input", updateActiveFrameReview);
  els.reviewGrid.addEventListener("input", updateActiveFrameReview);
  els.reviewRoom.addEventListener("input", updateActiveFrameReview);
  els.reviewTags.addEventListener("change", updateActiveFrameReview);

  ["dragenter", "dragover"].forEach((name) => {
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((name) => {
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("is-dragging");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    const file = Array.from(event.dataTransfer.files || [])[0];
    const filePath = file ? window.siteLens.getFilePath(file) : "";
    if (filePath) loadVideo(filePath);
  });

  els.frameGrid.addEventListener("change", (event) => {
    if (!event.target.matches("[data-frame-select]")) return;
    const frame = findFrame(event.target.dataset.frameSelect);
    if (frame) frame.selected = event.target.checked;
    updateFrameControls();
    scheduleAutoSaveProject();
  });

  els.frameGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-frame-card]");
    if (!card) return;
    setActiveFrame(card.dataset.frameCard);
  });
}

async function renderVersion() {
  try {
    const version = await window.siteLens.getVersion();
    els.versionBadge.textContent = `SiteLens v${version}`;
  } catch {
    els.versionBadge.textContent = "SiteLens";
  }
}

async function checkTools() {
  try {
    state.tools = await window.siteLens.checkTools();
    const ok = state.tools.ffmpeg.available && state.tools.ffprobe.available;
    els.toolStatus.textContent = ok ? "FFmpeg ready" : "FFmpeg missing";
    els.toolStatus.classList.toggle("is-error", !ok);
  } catch (error) {
    showError(toMessage(error));
  }
}

async function restoreSettings() {
  try {
    state.settings = await window.siteLens.getSettings();
    applySettings(state.settings);
  } catch {
    state.settings = null;
  }
}

function applySettings(settings = {}) {
  const interval = settings.extraction?.intervalSeconds || 30;
  if ([5, 10, 30, 60].includes(interval)) {
    els.intervalSelect.value = String(interval);
  } else {
    els.intervalSelect.value = "custom";
    els.customIntervalInput.value = interval;
  }
  const metadata = settings.metadata || {};
  els.projectName.value = metadata.projectName || "";
  els.shootingDate.value = metadata.shootingDate || "";
  els.photographer.value = metadata.photographer || "";
  els.location.value = metadata.location || "";
  els.memo.value = metadata.memo || "";
  state.filters.tag = settings.review?.filterTag || "";
  state.filters.priority = settings.review?.filterPriority || "";
  els.filterTag.value = state.filters.tag;
  els.filterPriority.value = state.filters.priority;
  els.reviewPriority.value = settings.review?.priority || "情報";
  setCheckedTags(settings.review?.tags || []);
  if (settings.paths?.lastOutputDirectory) {
    state.outputDirectory = settings.paths.lastOutputDirectory;
    els.outputDirectoryText.textContent = state.outputDirectory;
  }
  updateIntervalControls();
}

async function selectVideo() {
  clearMessages();
  const filePath = await window.siteLens.selectVideoFile();
  if (filePath) await loadVideo(filePath);
}

async function loadVideo(filePath) {
  clearMessages();
  resetFrames();
  setRunStatus("動画解析中", 0);
  els.fileStatus.textContent = "解析中";
  try {
    state.metadata = await window.siteLens.probeVideo(filePath);
    renderMetadata();
    if (!state.outputDirectory) {
      state.outputDirectory = `${state.metadata.directory}\\SiteLens_Report`;
      els.outputDirectoryText.textContent = state.outputDirectory;
    }
    els.extractButton.disabled = false;
    els.fileStatus.textContent = "読み込み済み";
    setRunStatus("待機中", 0);
    await saveSettings({ lastInputDirectory: state.metadata.directory });
  } catch (error) {
    state.metadata = null;
    els.extractButton.disabled = true;
    els.fileStatus.textContent = "読み込み失敗";
    setRunStatus("失敗", 0);
    showError(toMessage(error));
  }
}

function renderMetadata() {
  const meta = state.metadata;
  els.infoName.textContent = meta.fileName;
  els.infoSize.textContent = formatBytes(meta.size);
  els.infoDuration.textContent = formatDuration(meta.duration);
  els.infoResolution.textContent = meta.width && meta.height ? `${meta.width} x ${meta.height}` : "-";
  els.infoFrameRate.textContent = meta.frameRate ? `${meta.frameRate.toFixed(2)} fps` : "-";
  els.infoCodec.textContent = meta.videoCodec || "-";
}

async function selectOutputDirectory() {
  clearMessages();
  const defaultPath = state.outputDirectory || (state.metadata ? `${state.metadata.directory}\\SiteLens_Frames` : "");
  const folderPath = await window.siteLens.selectOutputFolder(defaultPath);
  if (!folderPath) return;
  state.outputDirectory = folderPath;
  els.outputDirectoryText.textContent = folderPath;
  await saveSettings({ lastOutputDirectory: folderPath });
}

async function extractFrames() {
  if (!state.metadata || state.extracting) return;
  clearMessages();
  state.extracting = true;
  els.extractButton.disabled = true;
  setRunStatus("抽出中", 0);
  try {
    const intervalSeconds = getIntervalSeconds();
    const outputDirectory = state.outputDirectory || `${state.metadata.directory}\\SiteLens_Report`;
    const result = await window.siteLens.extractFrames({
      filePath: state.metadata.filePath,
      intervalSeconds,
      outputDirectory,
    });
    state.outputDirectory = result.outputDirectory;
    state.frames = result.frames.map((frame) => ({ ...frame, priority: "情報", tags: [], comment: "", floor: "", grid: "", room: "" }));
    state.activeFramePath = state.frames[0]?.path || "";
    els.outputDirectoryText.textContent = result.outputDirectory;
    renderFrames();
    renderActiveFrameReview();
    setRunStatus("完了", 100);
    showNotice(`${state.frames.length} 枚の静止画を抽出しました。`);
    els.openOutputButton.disabled = false;
    els.saveProjectButton.disabled = false;
    els.exportCsvButton.disabled = false;
    await saveProject();
    await saveSettings({ lastOutputDirectory: result.outputDirectory });
  } catch (error) {
    setRunStatus("失敗", 0);
    showError(toMessage(error));
  } finally {
    state.extracting = false;
    els.extractButton.disabled = !state.metadata;
  }
}

async function copySelectedFrames() {
  const selected = state.frames.filter((frame) => frame.selected);
  if (!selected.length) return;
  clearMessages();
  try {
    const result = await window.siteLens.copySelectedFrames({
      sourceDirectory: state.outputDirectory,
      destinationDirectory: `${state.outputDirectory}\\Selected_Frames`,
      frames: selected,
    });
    showNotice(`${result.copied.length} 枚を Selected_Frames にコピーしました。`);
    await window.siteLens.openFolder(result.destinationDirectory);
  } catch (error) {
    showError(toMessage(error));
  }
}

async function exportReviewCsv() {
  const selectedItems = getReviewItems().filter((item) => item.selected);
  if (!selectedItems.length) {
    showError("CSV出力する画像を選択してください。");
    return;
  }
  try {
    const result = await window.siteLens.exportReviewCsv({
      outputDirectory: state.outputDirectory,
      reviewItems: selectedItems,
    });
    showNotice(`CSVを出力しました: ${result.csvPath}`);
  } catch (error) {
    showError(toMessage(error));
  }
}

async function exportReviewPptx() {
  const selectedFrames = state.frames.filter((frame) => frame.selected);
  if (!selectedFrames.length) {
    showError("PowerPoint出力対象がありません");
    return;
  }
  try {
    const result = await window.siteLens.exportReviewPptx({
      outputDirectory: state.outputDirectory,
      metadata: getProjectMetadata(),
      video: state.metadata,
      frames: selectedFrames,
    });
    showNotice(`PowerPoint出力完了: ${result.pptxPath}`);
    els.openOutputButton.disabled = false;
  } catch (error) {
    showError(toMessage(error));
  }
}

async function saveProject() {
  if (!state.outputDirectory) return;
  try {
    const result = await window.siteLens.saveProject({
      outputDirectory: state.outputDirectory,
      metadata: getProjectMetadata(),
      video: state.metadata,
      frames: state.frames,
      reviewItems: getReviewItems(),
    });
    await saveSettings();
    showNotice(`レビュー情報を保存しました: ${result.projectPath}`);
  } catch (error) {
    showError(toMessage(error));
  }
}

async function openOutputDirectory() {
  if (!state.outputDirectory) return;
  try {
    await window.siteLens.openFolder(state.outputDirectory);
  } catch (error) {
    showError(toMessage(error));
  }
}

function renderFrames() {
  const visibleFrames = getVisibleFrames();
  els.frameGrid.innerHTML = "";
  for (const frame of visibleFrames) {
    const card = document.createElement("article");
    card.className = `frame-card priority-${priorityClass(frame.priority)}${frame.path === state.activeFramePath ? " is-active" : ""}`;
    card.dataset.frameCard = frame.path;
    card.innerHTML = `
      <label class="frame-check" onclick="event.stopPropagation()">
        <input type="checkbox" data-frame-select="${escapeHtml(frame.path)}" ${frame.selected ? "checked" : ""}>
        <span>${escapeHtml(frame.timecode)}</span>
      </label>
      <img src="${frame.previewUrl}" alt="${escapeHtml(frame.fileName)}">
      <div class="frame-meta">
        <div class="frame-title-row"><strong>${escapeHtml(frame.fileName)}</strong><span class="priority-badge ${priorityClass(frame.priority)}">${escapeHtml(frame.priority)}</span></div>
        <span>${escapeHtml(frame.timecode)}</span>
        <span>${escapeHtml([frame.floor, frame.grid, frame.room].filter(Boolean).join(" / ") || "-")}</span>
        <p>${escapeHtml(frame.comment || "コメントなし")}</p>
        <div class="tag-list">${frame.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
    `;
    els.frameGrid.appendChild(card);
  }
  updateFrameControls();
}

function getVisibleFrames() {
  return state.frames.filter((frame) => {
    const tagOk = !state.filters.tag || frame.tags.includes(state.filters.tag);
    const priorityOk = !state.filters.priority || frame.priority === state.filters.priority;
    return tagOk && priorityOk;
  });
}

function setActiveFrame(path) {
  state.activeFramePath = path;
  renderFrames();
  renderActiveFrameReview();
}

function renderActiveFrameReview() {
  const frame = getActiveFrame();
  const disabled = !frame;
  els.activeFrameName.textContent = frame ? `${frame.fileName} / ${frame.timecode}` : "画像を選択してください";
  els.reviewPriority.disabled = disabled;
  els.reviewComment.disabled = disabled;
  els.reviewFloor.disabled = disabled;
  els.reviewGrid.disabled = disabled;
  els.reviewRoom.disabled = disabled;
  els.reviewPriority.value = frame?.priority || "情報";
  els.reviewComment.value = frame?.comment || "";
  els.reviewFloor.value = frame?.floor || "";
  els.reviewGrid.value = frame?.grid || "";
  els.reviewRoom.value = frame?.room || "";
  setCheckedTags(frame?.tags || []);
  for (const input of els.reviewTags.querySelectorAll("input")) input.disabled = disabled;
}

function updateActiveFrameReview() {
  const frame = getActiveFrame();
  if (!frame) return;
  frame.priority = els.reviewPriority.value;
  frame.comment = els.reviewComment.value;
  frame.floor = els.reviewFloor.value;
  frame.grid = els.reviewGrid.value;
  frame.room = els.reviewRoom.value;
  frame.tags = getCheckedTags();
  renderFrames();
  scheduleSaveSettings();
  scheduleAutoSaveProject();
}

function getActiveFrame() {
  return findFrame(state.activeFramePath);
}

function findFrame(path) {
  return state.frames.find((frame) => frame.path === path);
}

function getCheckedTags() {
  return Array.from(els.reviewTags.querySelectorAll("input:checked")).map((input) => input.value);
}

function setCheckedTags(tags) {
  const values = new Set(tags || []);
  for (const input of els.reviewTags.querySelectorAll("input")) input.checked = values.has(input.value);
}

function clearFilters() {
  state.filters.tag = "";
  state.filters.priority = "";
  els.filterTag.value = "";
  els.filterPriority.value = "";
  renderFrames();
  scheduleSaveSettings();
}

function setFrameSelection(selected) {
  for (const frame of getVisibleFrames()) frame.selected = selected;
  renderFrames();
  scheduleAutoSaveProject();
}

function updateFrameControls() {
  const total = state.frames.length;
  const visible = getVisibleFrames().length;
  const selected = state.frames.filter((frame) => frame.selected).length;
  els.frameCount.textContent = `${selected} / ${total} selected (${visible} visible)`;
  els.copySelectedButton.disabled = selected === 0;
  els.exportCsvButton.disabled = selected === 0;
  els.exportPptxButton.disabled = selected === 0;
  els.selectAllFrames.disabled = visible === 0;
  els.clearFrameSelection.disabled = visible === 0;
}

function resetFrames() {
  state.frames = [];
  state.activeFramePath = "";
  els.frameGrid.innerHTML = "";
  els.openOutputButton.disabled = true;
  els.copySelectedButton.disabled = true;
  els.saveProjectButton.disabled = true;
  els.exportCsvButton.disabled = true;
  els.exportPptxButton.disabled = true;
  renderActiveFrameReview();
  updateFrameControls();
}

function getReviewItems() {
  return state.frames.map((frame) => ({
    file: frame.fileName,
    fileName: frame.fileName,
    path: frame.path,
    frame: frame.fileName,
    timestamp: frame.timecode,
    timecode: frame.timecode,
    priority: frame.priority || "情報",
    tags: frame.tags || [],
    comment: frame.comment || "",
    floor: frame.floor || "",
    grid: frame.grid || "",
    room: frame.room || "",
    selected: frame.selected !== false,
  }));
}

function getIntervalSeconds() {
  if (els.intervalSelect.value === "custom") {
    return clampNumber(Number(els.customIntervalInput.value), 1, 3600, 30);
  }
  return Number(els.intervalSelect.value || 30);
}

function updateIntervalControls() {
  els.customIntervalField.classList.toggle("hidden", els.intervalSelect.value !== "custom");
}

function getProjectMetadata() {
  return {
    projectName: els.projectName.value.trim(),
    shootingDate: els.shootingDate.value,
    photographer: els.photographer.value.trim(),
    location: els.location.value.trim(),
    memo: els.memo.value.trim(),
  };
}

function buildSettings(pathOverrides = {}) {
  const current = state.settings || {};
  return {
    paths: {
      lastInputDirectory: current.paths?.lastInputDirectory || "",
      lastOutputDirectory: state.outputDirectory || current.paths?.lastOutputDirectory || "",
      ...pathOverrides,
    },
    extraction: {
      intervalSeconds: getIntervalSeconds(),
    },
    metadata: getProjectMetadata(),
    review: {
      tags: getCheckedTags(),
      priority: els.reviewPriority.value || "情報",
      filterTag: state.filters.tag,
      filterPriority: state.filters.priority,
    },
  };
}

function scheduleSaveSettings() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveSettings(), 250);
}

function scheduleAutoSaveProject() {
  if (!state.outputDirectory || state.frames.length === 0) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveProject(), 500);
}

async function saveSettings(pathOverrides = {}) {
  try {
    state.settings = await window.siteLens.saveSettings(buildSettings(pathOverrides));
  } catch {
    // Settings persistence should not interrupt field work.
  }
}

function updateProgress(progress) {
  setRunStatus(progress.status || "抽出中", progress.percent || 0);
}

function setRunStatus(status, percent) {
  const rounded = Math.round(percent || 0);
  els.runStatus.textContent = status;
  els.progressBar.value = rounded;
  els.percentText.textContent = `${rounded}%`;
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove("hidden");
}

function showNotice(message) {
  els.noticeBox.textContent = message;
  els.noticeBox.classList.remove("hidden");
}

function clearMessages() {
  els.errorBox.classList.add("hidden");
  els.noticeBox.classList.add("hidden");
  els.errorBox.textContent = "";
  els.noticeBox.textContent = "";
}

function toMessage(error) {
  return error?.message || String(error);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function priorityClass(priority) {
  return {
    要確認: "confirm",
    是正: "fix",
    保留: "hold",
    完了: "done",
    情報: "info",
  }[priority] || "info";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
