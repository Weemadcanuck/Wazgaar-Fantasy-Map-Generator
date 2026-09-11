import { contextBridge, ipcRenderer } from "electron";
import { ARCHIVE_EXPORT_DIRECTORY_CHANNEL, type ArchiveDirectoryRequest } from "../src/types/archive-export-ipc";

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  archiveExport: {
    writeDirectory: (request: ArchiveDirectoryRequest) => ipcRenderer.invoke(ARCHIVE_EXPORT_DIRECTORY_CHANNEL, request)
  }
});
