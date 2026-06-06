const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("siteLens", {
  getFilePath: (file) => webUtils.getPathForFile(file),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  checkTools: () => ipcRenderer.invoke("tools:check"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  selectVideoFile: () => ipcRenderer.invoke("file:select-video"),
  selectOutputFolder: (defaultPath) => ipcRenderer.invoke("folder:select-output", defaultPath),
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
  probeVideo: (filePath) => ipcRenderer.invoke("video:probe", filePath),
  extractFrames: (payload) => ipcRenderer.invoke("frames:extract", payload),
  copySelectedFrames: (payload) => ipcRenderer.invoke("frames:copy-selected", payload),
  saveProject: (payload) => ipcRenderer.invoke("project:save", payload),
  exportReviewCsv: (payload) => ipcRenderer.invoke("review:export-csv", payload),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("frames:progress", listener);
    return () => ipcRenderer.removeListener("frames:progress", listener);
  },
});
