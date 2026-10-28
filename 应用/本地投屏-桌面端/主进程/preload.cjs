const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopLocal", {
  probeInfo: (ip, port) => ipcRenderer.invoke("probe-info", { ip, port }),
  openDeviceWindow: (device) => ipcRenderer.invoke("open-device-window", device),
  toggleMaximize: () => ipcRenderer.invoke("toggle-maximize"),
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  fitDeviceContent: (payload) => ipcRenderer.invoke("fit-device-content", payload || {}),
  scanLanStatus: () => ipcRenderer.invoke("scan-lan-status"),
  scanLan: (opts) => ipcRenderer.invoke("scan-lan", opts || {}),
  cancelScanLan: () => ipcRenderer.invoke("scan-lan-cancel"),
  onScanProgress: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on("scan-lan-progress", handler);
    return () => ipcRenderer.removeListener("scan-lan-progress", handler);
  },
  onDeviceSetMode: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("device-set-mode", handler);
    return () => ipcRenderer.removeListener("device-set-mode", handler);
  },
});
