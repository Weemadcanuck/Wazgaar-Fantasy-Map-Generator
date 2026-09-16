import { contextBridge, ipcRenderer } from "electron";
import { ARCHIVE_EXPORT_DIRECTORY_CHANNEL, type ArchiveDirectoryRequest } from "../src/types/archive-export-ipc";
import { DESKTOP_QUIT_CHANNEL } from "../src/types/desktop-ipc";

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  requestQuit: () => ipcRenderer.send(DESKTOP_QUIT_CHANNEL),
  archiveExport: {
    writeDirectory: (request: ArchiveDirectoryRequest) => ipcRenderer.invoke(ARCHIVE_EXPORT_DIRECTORY_CHANNEL, request)
  }
});
