const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"]);
const DEFAULT_PRIORITY = "情報";
const DEFAULT_SETTINGS = {
  paths: { lastInputDirectory: "", lastOutputDirectory: "" },
  extraction: { intervalSeconds: 30 },
  metadata: { projectName: "", shootingDate: "", photographer: "", location: "", memo: "" },
  review: { tags: [], priority: DEFAULT_PRIORITY, filterTag: "", filterPriority: "" },
};

let mainWindow;
let currentProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 980,
    minHeight: 720,
    title: "SiteLens",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, "preload.js") },
  });
  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  app.setAppUserModelId("jp.airesearchagl.sitelens");
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerIpc() {
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("tools:check", checkTools);
  ipcMain.handle("settings:get", getSavedSettings);
  ipcMain.handle("settings:save", (_event, settings) => saveSettings(settings));
  ipcMain.handle("file:select-video", selectVideoFile);
  ipcMain.handle("folder:select-output", (_event, defaultPath) => selectOutputFolder(defaultPath));
  ipcMain.handle("folder:open", (_event, folderPath) => openFolder(folderPath));
  ipcMain.handle("video:probe", (_event, filePath) => probeVideo(filePath));
  ipcMain.handle("frames:extract", (_event, payload) => extractFrames(payload));
  ipcMain.handle("frames:copy-selected", (_event, payload) => copySelectedFrames(payload));
  ipcMain.handle("project:save", (_event, payload) => saveProjectMetadata(payload));
  ipcMain.handle("review:export-csv", (_event, payload) => exportReviewCsv(payload));
}

async function checkTools() {
  const ffmpeg = resolveTool("ffmpeg");
  const ffprobe = resolveTool("ffprobe");
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    getToolVersion(ffmpeg.command, ["-version"]),
    getToolVersion(ffprobe.command, ["-version"]),
  ]);
  return { ffmpegPath: ffmpeg.command, ffprobePath: ffprobe.command, ffmpegSource: ffmpeg.source, ffprobeSource: ffprobe.source, ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion };
}

function resolveTool(toolName) {
  const exeName = process.platform === "win32" ? `${toolName}.exe` : toolName;
  const bundledPath = path.join(process.resourcesPath || __dirname, "ffmpeg", "win", exeName);
  const devBundledPath = path.join(__dirname, "resources", "ffmpeg", "win", exeName);
  if (fs.existsSync(devBundledPath)) return { command: devBundledPath, source: "bundled" };
  if (fs.existsSync(bundledPath)) return { command: bundledPath, source: "bundled" };
  return { command: toolName, source: "path" };
}

function resolveToolPath(toolName) {
  return resolveTool(toolName).command;
}

function getToolVersion(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.stderr.on("data", (data) => { errorOutput += data.toString(); });
    child.on("error", (error) => resolve({ available: false, message: error.message }));
    child.on("close", (code) => {
      const text = output || errorOutput;
      resolve({ available: code === 0, message: code === 0 ? firstLine(text) : errorOutput || output || `exit code ${code}`, version: firstLine(text) });
    });
  });
}

async function selectVideoFile() {
  const settings = getSavedSettings();
  const defaultPath = settings.paths.lastInputDirectory && fs.existsSync(settings.paths.lastInputDirectory) ? settings.paths.lastInputDirectory : undefined;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select video file",
    properties: ["openFile"],
    defaultPath,
    filters: [{ name: "Video", extensions: ["mp4", "mov", "m4v", "avi", "mkv", "webm"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

async function selectOutputFolder(defaultPath) {
  const settings = getSavedSettings();
  const initialPath = defaultPath && fs.existsSync(defaultPath)
    ? defaultPath
    : settings.paths.lastOutputDirectory && fs.existsSync(settings.paths.lastOutputDirectory)
      ? settings.paths.lastOutputDirectory
      : undefined;
  const result = await dialog.showOpenDialog(mainWindow, { title: "Select output folder", properties: ["openDirectory", "createDirectory"], defaultPath: initialPath });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

async function probeVideo(filePath) {
  validateInputFile(filePath);
  const result = await runProcess(resolveToolPath("ffprobe"), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath]);
  if (result.code !== 0) throw new UserError("ffprobe failed.");
  const data = JSON.parse(result.stdout);
  const videoStream = data.streams.find((stream) => stream.codec_type === "video") || {};
  const stat = fs.statSync(filePath);
  return {
    filePath,
    fileName: path.basename(filePath),
    directory: path.dirname(filePath),
    size: stat.size,
    duration: Number(data.format?.duration || videoStream.duration || 0),
    width: Number(videoStream.width || 0),
    height: Number(videoStream.height || 0),
    videoCodec: videoStream.codec_name || "unknown",
    frameRate: parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate),
  };
}

async function extractFrames(payload = {}) {
  validateInputFile(payload.filePath);
  const intervalSeconds = clampNumber(Number(payload.intervalSeconds), 1, 3600, 30);
  const metadata = await probeVideo(payload.filePath);
  const outputDirectory = payload.outputDirectory || buildDefaultOutputDirectory(payload.filePath);
  fs.mkdirSync(outputDirectory, { recursive: true });
  ensureWritable(outputDirectory);
  const baseName = sanitizeFileName(path.parse(payload.filePath).name);
  const outputPattern = path.join(outputDirectory, `${baseName}_%04d.jpg`);
  const args = ["-y", "-i", payload.filePath, "-vf", `fps=1/${intervalSeconds}`, "-q:v", "2", outputPattern];
  const startedAt = Date.now();
  const result = await runFfmpegWithProgress(args, metadata.duration, startedAt);
  if (result.code !== 0) throw new UserError(`Frame extraction failed.\n${lastLines(result.stderr, 8)}`);
  const frames = listExtractedFrames(outputDirectory, baseName, intervalSeconds);
  return { outputDirectory, intervalSeconds, frames };
}

function runFfmpegWithProgress(args, duration, startedAt) {
  return new Promise((resolve, reject) => {
    currentProcess = spawn(resolveToolPath("ffmpeg"), args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    currentProcess.stdout.on("data", (data) => { stdout += data.toString(); });
    currentProcess.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      emitProgress(text, duration, startedAt);
    });
    currentProcess.on("error", (error) => { currentProcess = null; reject(new UserError("FFmpeg start failed.", error)); });
    currentProcess.on("close", (code) => { currentProcess = null; sendProgress({ status: code === 0 ? "完了" : "失敗", percent: code === 0 ? 100 : 0 }); resolve({ code, stdout, stderr }); });
  });
}

async function copySelectedFrames(payload = {}) {
  const frames = Array.isArray(payload.frames) ? payload.frames : [];
  if (frames.length === 0) throw new UserError("No selected frames.");
  const sourceDirectory = payload.sourceDirectory;
  if (!sourceDirectory || !fs.existsSync(sourceDirectory)) throw new UserError("Source frame folder not found.");
  const destinationDirectory = payload.destinationDirectory || path.join(path.dirname(sourceDirectory), "Selected_Frames");
  fs.mkdirSync(destinationDirectory, { recursive: true });
  ensureWritable(destinationDirectory);
  const copied = [];
  for (const frame of frames) {
    const sourcePath = frame.path || frame.filePath;
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    const destinationPath = buildUniqueFilePath(destinationDirectory, path.basename(sourcePath));
    fs.copyFileSync(sourcePath, destinationPath);
    copied.push(destinationPath);
  }
  return { destinationDirectory, copied };
}

async function saveProjectMetadata(payload = {}) {
  const outputDirectory = payload.outputDirectory;
  if (!outputDirectory) throw new UserError("Output folder is required.");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const metadata = normalizeProjectMetadata(payload.metadata || {});
  const reviewItems = normalizeReviewItems(payload.reviewItems || payload.frames || []);
  const project = {
    app: "SiteLens",
    version: app.getVersion(),
    savedAt: new Date().toISOString(),
    project: metadata.projectName,
    video: payload.video || null,
    metadata,
    frames: Array.isArray(payload.frames) ? payload.frames : [],
    reviewItems,
  };
  const projectPath = path.join(outputDirectory, "sitelens-project.json");
  fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  return { projectPath };
}

async function exportReviewCsv(payload = {}) {
  const outputDirectory = payload.outputDirectory;
  if (!outputDirectory) throw new UserError("Output folder is required.");
  fs.mkdirSync(outputDirectory, { recursive: true });
  ensureWritable(outputDirectory);
  const items = normalizeReviewItems(payload.reviewItems || []).filter((item) => item.selected !== false);
  const lines = [["file", "timestamp", "priority", "tags", "comment"].join(",")];
  for (const item of items) {
    lines.push([csvValue(item.file), csvValue(item.timestamp), csvValue(item.priority), csvValue(item.tags.join("|")), csvValue(item.comment)].join(","));
  }
  const csvPath = path.join(outputDirectory, "sitelens-review.csv");
  fs.writeFileSync(csvPath, `${lines.join("\r\n")}\r\n`, "utf8");
  return { csvPath, count: items.length };
}

function listExtractedFrames(directory, baseName, intervalSeconds) {
  const files = fs.readdirSync(directory)
    .filter((file) => file.toLowerCase().endsWith(".jpg") && file.startsWith(`${baseName}_`))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return files.map((file, index) => {
    const filePath = path.join(directory, file);
    const timeSeconds = index * intervalSeconds;
    return { fileName: file, path: filePath, previewUrl: pathToFileURL(filePath).href, timeSeconds, timecode: formatTimecode(timeSeconds), selected: true, tags: [], priority: DEFAULT_PRIORITY, comment: "", floor: "", grid: "", room: "" };
  });
}

function buildDefaultOutputDirectory(filePath) {
  return path.join(path.dirname(filePath), "SiteLens_Frames");
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getSavedSettings() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) return cloneDefaultSettings();
  try { return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8"))); } catch { return cloneDefaultSettings(); }
}

function saveSettings(settings = {}) {
  const normalized = normalizeSettings(settings);
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return { ...normalized, settingsPath };
}

function normalizeSettings(settings = {}) {
  const paths = settings.paths || {};
  const extraction = settings.extraction || {};
  return {
    paths: { lastInputDirectory: stringValue(paths.lastInputDirectory), lastOutputDirectory: stringValue(paths.lastOutputDirectory) },
    extraction: { intervalSeconds: clampNumber(Number(extraction.intervalSeconds), 1, 3600, DEFAULT_SETTINGS.extraction.intervalSeconds) },
    metadata: normalizeProjectMetadata(settings.metadata || {}),
    review: normalizeReviewSettings(settings.review || {}),
  };
}

function normalizeReviewSettings(review = {}) {
  return { tags: Array.isArray(review.tags) ? review.tags.filter((tag) => typeof tag === "string") : [], priority: stringValue(review.priority) || DEFAULT_PRIORITY, filterTag: stringValue(review.filterTag), filterPriority: stringValue(review.filterPriority) };
}

function normalizeReviewItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    file: stringValue(item.file || item.fileName),
    frame: stringValue(item.frame || item.file || item.fileName),
    timestamp: stringValue(item.timestamp || item.timecode),
    timecode: stringValue(item.timecode || item.timestamp),
    priority: stringValue(item.priority) || DEFAULT_PRIORITY,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === "string") : [],
    comment: stringValue(item.comment),
    floor: stringValue(item.floor),
    grid: stringValue(item.grid),
    room: stringValue(item.room),
    selected: item.selected !== false,
  }));
}

function normalizeProjectMetadata(metadata = {}) {
  return { projectName: stringValue(metadata.projectName), shootingDate: stringValue(metadata.shootingDate), photographer: stringValue(metadata.photographer), location: stringValue(metadata.location), memo: stringValue(metadata.memo) };
}

function csvValue(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function emitProgress(text, duration, startedAt) {
  const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  const encodedSeconds = timeMatch ? toSeconds(timeMatch[1], timeMatch[2], timeMatch[3]) : 0;
  const percent = duration > 0 ? Math.min(99, Math.max(0, (encodedSeconds / duration) * 100)) : 0;
  sendProgress({ status: "抽出中", percent, elapsedSeconds: (Date.now() - startedAt) / 1000 });
}

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("frames:progress", payload);
}

async function openFolder(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) throw new UserError("Folder not found.");
  await shell.openPath(folderPath);
  return true;
}

function validateInputFile(filePath) {
  if (!filePath || typeof filePath !== "string" || !fs.existsSync(filePath)) throw new UserError("Video file not found.");
  if (!SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) throw new UserError("Unsupported video format.");
}

function ensureWritable(directory) {
  try { fs.accessSync(directory, fs.constants.W_OK); } catch { throw new UserError("Output folder is not writable."); }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", (error) => reject(new UserError("External tool start failed.", error)));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function buildUniqueFilePath(directory, fileName) {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function sanitizeFileName(value) {
  return String(value || "frame").replace(/[<>:"/\\|?*]/g, "_").trim() || "frame";
}

function parseFrameRate(value) {
  if (!value || value === "0/0") return null;
  const [num, den] = value.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function formatTimecode(seconds) {
  const total = Math.round(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function toSeconds(hours, minutes, seconds) {
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function firstLine(text) {
  return String(text || "").split(/\r?\n/).find(Boolean) || "";
}

function lastLines(text, count) {
  return String(text || "").split(/\r?\n/).filter(Boolean).slice(-count).join("\n");
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

class UserError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "UserError";
    this.cause = cause;
  }
}
