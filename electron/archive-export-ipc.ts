import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import {
  ARCHIVE_EXPORT_DIRECTORY_CHANNEL,
  type ArchiveDirectoryRequest,
  type ArchiveDirectoryResult
} from "../src/types/archive-export-ipc";
import { readLastArchiveDirectory, writeLastArchiveDirectory } from "./archive-export-location";
import { summarizeArchiveReport } from "./archive-export-report";
import { applyArchiveDirectoryWrite, previewArchiveDirectoryWrite } from "./archive-export-writer";

const locationFile = () => path.join(app.getPath("userData"), "archive-export-location.json");

const showMessage = async (window: BrowserWindow | null, options: Electron.MessageBoxOptions) =>
  window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);

const chooseDirectory = async (window: BrowserWindow | null) => {
  const options: Electron.OpenDialogOptions = {
    title: "Select the managed Archive export directory",
    buttonLabel: "Use this folder",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: readLastArchiveDirectory(locationFile())
  };
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
};

const handleDirectoryExport = async (
  event: Electron.IpcMainInvokeEvent,
  request: ArchiveDirectoryRequest
): Promise<ArchiveDirectoryResult> => {
  const window = BrowserWindow.fromWebContents(event.sender);
  try {
    const selection = await chooseDirectory(window);
    if (selection.canceled || !selection.filePaths[0]) return { status: "cancelled" };

    const directory = selection.filePaths[0];
    writeLastArchiveDirectory(locationFile(), directory);
    const report = await previewArchiveDirectoryWrite(directory, request);
    if (!report.canApply) {
      await showMessage(window, {
        type: "warning",
        buttons: ["Close"],
        title: "Archive export blocked",
        message: "No files were written because the dry run found conflicts.",
        detail: summarizeArchiveReport(report)
      });
      return { status: "blocked", directory, report };
    }

    const hasWrites = report.counts.create + report.counts.update + report.counts.move > 0;
    if (!hasWrites) {
      await showMessage(window, {
        type: "info",
        buttons: ["Close"],
        title: "Archive export is current",
        message: "The selected directory already matches this map.",
        detail: summarizeArchiveReport(report)
      });
      return { status: "unchanged", directory, report };
    }

    const confirmation = await showMessage(window, {
      type: "question",
      buttons: ["Export", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Confirm Archive export",
      message: "Apply this dry-run plan to the selected directory?",
      detail: `${directory}\n\n${summarizeArchiveReport(report)}`
    });
    if (confirmation.response !== 0) return { status: "cancelled", directory, report };

    const applied = await applyArchiveDirectoryWrite(directory, request);
    if (!applied.applied) {
      await showMessage(window, {
        type: "warning",
        buttons: ["Close"],
        title: "Archive export changed before writing",
        message: "No files were written because a new conflict appeared after the dry run.",
        detail: summarizeArchiveReport(applied.report)
      });
      return { status: "blocked", directory, report: applied.report };
    }

    await showMessage(window, {
      type: "info",
      buttons: ["Close"],
      title: "Archive export complete",
      message: "Generated reference notes were written successfully.",
      detail: `${directory}\n\n${summarizeArchiveReport(applied.report)}`
    });
    return { status: "written", directory, report: applied.report };
  } catch (error) {
    const message = (error as Error)?.message || "Unknown error";
    await showMessage(window, {
      type: "error",
      buttons: ["Close"],
      title: "Archive export failed",
      message: "No manifest was committed.",
      detail: message
    });
    return { status: "failed", message };
  }
};

export const registerArchiveExportHandlers = () => {
  ipcMain.handle(ARCHIVE_EXPORT_DIRECTORY_CHANNEL, handleDirectoryExport);
};
