import type { ArchiveDirectoryRequest, ArchiveDirectoryResult } from "@/types/archive-export-ipc";

// What the app is running inside: a browser tab, an installed PWA or the Electron desktop shell
export type ElectronBridge = {
  archiveExport: {
    writeDirectory: (request: ArchiveDirectoryRequest) => Promise<ArchiveDirectoryResult>;
  };
  isElectron: true;
  platform: string;
  versions: { electron: string; chrome: string; node: string };
};

export const isElectron = (): boolean => Boolean(window.electron?.isElectron);

export const savedMessage = (name: string): string =>
  isElectron() ? `${name} is saved` : `${name} is saved. Open "Downloads" screen (CTRL + J) to check`;

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}
