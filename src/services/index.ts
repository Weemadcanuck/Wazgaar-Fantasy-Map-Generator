import { createRegistry } from "@/utils/registry";
import "./platform";
import "./assistant";
import "./autosave";
import "./fonts";
import "./url-params";
import "./versioning";

export const Services = createRegistry({
  AppOffer: () => import("@/services/app-offer").then(m => m.AppOffer),
  ArchiveExport: () => import("@/services/io/archive-export-download").then(m => m.ArchiveExportDownload),
  Cloud: () => import("@/services/io/cloud").then(m => m.CloudStorage),
  ExportJson: () => import("@/services/io/export-json").then(m => m.ExportJson),
  ExportMap: () => import("@/services/io/export").then(m => m.ExportMap),
  Load: () => import("@/services/io/load").then(m => m.Load),
  Save: () => import("@/services/io/save").then(m => m.Save),
  ToolActions: () => import("@/services/tool-actions").then(m => m.ToolActions),
  UiTour: () => import("@/services/ui-tour").then(m => m.UiTour)
});

type ServicesRegistry = typeof Services;
declare global {
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var Services: ServicesRegistry;
}
window.Services = Services;
