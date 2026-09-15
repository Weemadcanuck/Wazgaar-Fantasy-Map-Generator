import { Layers } from "@/components/layers";
import { tip } from "@/components/tooltips";
import { getReliefRenderStatus } from "@/renderers/draw-relief-icons";
import { PerformanceMetrics } from "@/renderers/viewport/performance-metrics";
import { VERSION } from "@/services/versioning";

let pending = false;

function snapshot() {
  return {
    mapId,
    reliefCount: pack.relief?.length ?? 0,
    reliefRendering: getReliefRenderStatus(),
    layers: Layers.state,
    reliefStyle: { ...style.relief },
    viewport: { scale, x: viewX, y: viewY, width: svgWidth, height: svgHeight },
    map: { width: graphWidth, height: graphHeight },
    hidden: document.hidden
  };
}

export function capturePerformance(): void {
  if (pending || PerformanceMetrics.active) {
    tip("A performance capture is already running", false, "warn");
    return;
  }
  if (document.getElementById("performanceCapture")) return;
  const dialog = document.createElement("div");
  dialog.id = "performanceCapture";
  dialog.className = "dialog";
  dialog.innerHTML = `<p>Warm up with one pan and zoom first. Recording starts 3 seconds after Start and lasts 22 seconds.
    Move around the map normally, keeping the same layers and window size. A JSON report downloads at the end.</p>
    <label>Capture label <input id="performanceCaptureLabel" value="Jotun relief on, run 1" style="width: 100%" /></label>`;
  document.getElementById("dialogs")!.append(dialog);
  $(dialog).dialog({
    title: "Record map performance",
    width: "30em",
    resizable: false,
    buttons: {
      Start: () => {
        const label = dialog.querySelector<HTMLInputElement>("input")!.value;
        $(dialog).dialog("close");
        beginCapture(label);
      },
      Cancel: () => $(dialog).dialog("close")
    },
    close: () => {
      $(dialog).dialog("destroy");
      dialog.remove();
    }
  });
}

function beginCapture(label: string): void {
  pending = true;
  tip("Capture starts in 3 seconds. Pan and zoom for 22 seconds; a JSON report will download.", true);
  window.setTimeout(() => {
    pending = false;
    const initial = snapshot();
    let becameHidden = document.hidden;
    const onVisibility = () => {
      becameHidden ||= document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    PerformanceMetrics.start();
    tip("Recording performance for 22 seconds…", true);
    window.setTimeout(() => {
      const metrics = PerformanceMetrics.stop();
      document.removeEventListener("visibilitychange", onVisibility);
      const report = {
        schemaVersion: 1,
        stage: "relief-retained-coverage",
        version: VERSION,
        capturedAt: new Date().toISOString(),
        label,
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        becameHidden,
        interpretation:
          "rAF intervals are a responsiveness proxy, not presented-frame or GPU timings. Nested phase durations overlap.",
        initial,
        final: snapshot(),
        ...metrics
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      const filenameLabel =
        label
          .trim()
          .replace(/[^a-z0-9_-]+/gi, "-")
          .slice(0, 80) || "capture";
      link.download = `relief-performance-${filenameLabel}-${Date.now()}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      tip("Performance capture finished. JSON report downloaded.", true, "success", 6000);
    }, 22000);
  }, 3000);
}
