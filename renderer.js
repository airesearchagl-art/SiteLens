const state = {
  tools: null,
  settings: null,
  metadata: null,
  outputDirectory: "",
  frames: [],
  extracting: false,
  saveTimer: null,
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
  frameCount: document.querySelector("#frameCount"),
  selectAllFrames: document.querySelector("#selectAllFrames"),
  clearFrameSelection: document.querySelector("#clearFrameSelection"),
  copySelectedButton: document.querySelector("#copySelectedButton"),
  frameGrid: document.querySelector("#frameGrid"),
};

init();

async function init() {
  bindEvents();
  await renderVersion();
  await restoreSettings();
  await checkTools();
  window.siteLens.onProgress(updateProgress);
}

function bindEvents() {
  els.selectVideoButton.addEventListener("click", selectVideo);
  els.selectOutputButton.addEventListener("click", selectOutputDirectory);
  els.extractButton.addEventListener("click", extractFrames);
  els.openOutputButton.addEventListener("click", openOutputDirectory);
  els.saveProjectButton.addEventListener("click", saveProject);
  els.copySelectedButton.addEventListener("click", copySelectedFrames);
  els.selectAllFrames.addEventListener("click", () => setFrameSelection(true));
  els.clearFrameSelection.addEventListener("click", () => setFrameSelection(false));

  els.intervalSelect.addEventListener("change", () => {
    updateIntervalControls();
    scheduleSaveSettings();
  });
  els.customIntervalInput.addEventListener("input", scheduleSaveSettings);

  [els.projectName, els.shootingDate, els.photographer, els.location, els.memo].forEach((input) => {
    input.addEventListener("input", scheduleSaveSettings);
  });

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
    const frame = state.frames.find((item) => item.path === event.target.dataset.frameSelect);
    if (frame) frame.selected = event.target.checked;
    updateFrameControls();
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
      state.outputDirectory = `${state.metadata.directory}\\SiteLens_Frames`;
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
    const outputDirectory = state.outputDirectory || `${state.metadata.directory}\\SiteLens_Frames`;
    const result = await window.siteLens.extractFrames({
      filePath: state.metadata.filePath,
      intervalSeconds,
      outputDirectory,
    });
    state.outputDirectory = result.outputDirectory;
    state.frames = result.frames;
    els.outputDirectoryText.textContent = result.outputDirectory;
    renderFrames();
    setRunStatus("完了", 100);
    showNotice(`${state.frames.length} 枚の静止画を抽出しました。`);
    els.openOutputButton.disabled = false;
    els.saveProjectButton.disabled = false;
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

async function saveProject() {
  if (!state.outputDirectory) return;
  try {
    const result = await window.siteLens.saveProject({
      outputDirectory: state.outputDirectory,
      metadata: getProjectMetadata(),
      video: state.metadata,
      frames: state.frames,
    });
    await saveSettings();
    showNotice(`メタ情報を保存しました: ${result.projectPath}`);
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
  els.frameGrid.innerHTML = "";
  for (const frame of state.frames) {
    const card = document.createElement("article");
    card.className = "frame-card";
    card.innerHTML = `
      <label class="frame-check">
        <input type="checkbox" data-frame-select="${escapeHtml(frame.path)}" ${frame.selected ? "checked" : ""}>
        <span>${escapeHtml(frame.timecode)}</span>
      </label>
      <img src="${frame.previewUrl}" alt="${escapeHtml(frame.fileName)}">
      <div class="frame-meta">
        <strong>${escapeHtml(frame.fileName)}</strong>
        <span>${escapeHtml(frame.timecode)}</span>
      </div>
    `;
    els.frameGrid.appendChild(card);
  }
  updateFrameControls();
}

function setFrameSelection(selected) {
  for (const frame of state.frames) frame.selected = selected;
  renderFrames();
}

function updateFrameControls() {
  const total = state.frames.length;
  const selected = state.frames.filter((frame) => frame.selected).length;
  els.frameCount.textContent = `${selected} / ${total} selected`;
  els.copySelectedButton.disabled = selected === 0;
  els.selectAllFrames.disabled = total === 0;
  els.clearFrameSelection.disabled = total === 0;
}

function resetFrames() {
  state.frames = [];
  els.frameGrid.innerHTML = "";
  els.openOutputButton.disabled = true;
  els.copySelectedButton.disabled = true;
  els.saveProjectButton.disabled = true;
  updateFrameControls();
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
  };
}

function scheduleSaveSettings() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveSettings(), 250);
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
