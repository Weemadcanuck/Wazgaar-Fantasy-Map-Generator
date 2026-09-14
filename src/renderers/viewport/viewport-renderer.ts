import { PerformanceMetrics } from "./performance-metrics";

interface ViewportLayerHandle {
  render: () => void;
  unregister: () => void;
}

export interface ViewportRenderContext {
  bounds: ViewportBounds;
  root: ParentNode;
  reason?: string;
}

interface ViewportLayer {
  id: string;
  render: (context: ViewportRenderContext) => void;
  isActive?: () => boolean;
  scaleSensitive?: boolean;
  viewportSensitive?: () => boolean;
  dependencies?: () => readonly string[];
  overscanPixels?: number;
  guardPixels?: number;
}

export interface ViewportBounds {
  scale: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ViewportLayerState {
  layer: ViewportLayer;
  materializedBounds: ViewportBounds | null;
  dirty: boolean;
  revision: number;
  reason: string;
}

export class Scene<T extends { id: string }> {
  private items = new Map<string, T>();
  valid = false;

  replace(items: T[]): void {
    this.items = new Map(items.map(item => [item.id, item]));
    this.valid = true;
  }

  set(item: T): void {
    this.items.set(item.id, item);
  }

  remove(id: string): void {
    this.items.delete(id);
  }

  invalidate(): void {
    this.items.clear();
    this.valid = false;
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  values(): IterableIterator<T> {
    return this.items.values();
  }
}

export class ViewportRenderer {
  private layers = new Map<string, ViewportLayerState>();
  private frameId: number | null = null;

  constructor(
    private readonly options: {
      getViewport: () => {
        scale: number;
        x: number;
        y: number;
        width: number;
        height: number;
      };
      overscanPixels: number;
      guardPixels: number;
    }
  ) {}

  register(layer: ViewportLayer): ViewportLayerHandle {
    const overscan = layer.overscanPixels ?? this.options.overscanPixels;
    const guard = layer.guardPixels ?? this.options.guardPixels;
    if (guard < 0 || overscan <= guard) throw new Error("Viewport overscan must exceed its non-negative guard");
    const state: ViewportLayerState = {
      layer,
      materializedBounds: null,
      dirty: true,
      revision: 0,
      reason: "initial render"
    };
    this.layers.set(layer.id, state);
    return {
      render: () => {
        if (this.layers.get(layer.id) === state) this.renderLive(state, "direct draw");
      },
      unregister: () => {
        if (this.layers.get(layer.id) !== state) return;
        this.layers.delete(layer.id);
        if (!this.layers.size) this.cancelScheduledRender();
      }
    };
  }

  schedule(): void {
    if (this.frameId !== null) return;
    if (![...this.layers.values()].some(state => this.shouldReconcile(state))) return;
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.flush("pan or zoom guard");
    });
  }

  /** Reconcile necessary layers using the latest viewport, including settled zoom changes. */
  flush(reason = "zoom end"): void {
    this.cancelScheduledRender();
    for (const state of this.layers.values()) {
      if (this.shouldReconcile(state)) this.renderLive(state, state.dirty ? state.reason : reason);
    }
  }

  invalidate(id: string, reason = "explicit invalidation"): void {
    const state = this.layers.get(id);
    if (!state) return;
    state.dirty = true;
    state.revision++;
    state.reason = reason;
    this.schedule();
  }

  invalidateAll(): void {
    for (const id of this.layers.keys()) this.invalidate(id);
  }

  /** Direct draws already covered the toggled layers; only their dependants need invalidation. */
  visibilityChanged(changedIds: readonly string[]): void {
    for (const { layer } of this.layers.values()) {
      if (layer.dependencies?.().some(id => id !== layer.id && changedIds.includes(id))) {
        this.invalidate(layer.id, "layer dependency");
      }
    }
    this.schedule();
  }

  /** Explicit force-render retained for callers that require it. Gestures use flush. */
  renderNow(reason = "zoom end"): void {
    this.cancelScheduledRender();
    for (const state of this.layers.values()) this.renderLive(state, reason);
  }

  renderTo(root: ParentNode): void {
    const bounds = { scale: 1, x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
    for (const { layer } of this.layers.values()) this.renderLayer(layer, { root, bounds, reason: "export" });
  }

  getContext(): ViewportRenderContext {
    return this.getLiveContext();
  }

  getVisibleBounds(): ViewportBounds {
    return this.getBounds(0);
  }

  private getBounds(paddingPixels: number): ViewportBounds {
    const { scale, x, y, width, height } = this.options.getViewport();
    const padding = paddingPixels / scale;
    return {
      scale,
      x0: -x / scale - padding,
      y0: -y / scale - padding,
      x1: (width - x) / scale + padding,
      y1: (height - y) / scale + padding
    };
  }

  private shouldReconcile(state: ViewportLayerState): boolean {
    if (state.layer.isActive?.() === false) {
      state.materializedBounds = null;
      return false;
    }
    const previous = state.materializedBounds;
    if (state.dirty || !previous) return true;
    if (state.layer.viewportSensitive?.()) {
      const current = this.getBounds(state.layer.overscanPixels ?? this.options.overscanPixels);
      if (
        current.x0 !== previous.x0 ||
        current.y0 !== previous.y0 ||
        current.x1 !== previous.x1 ||
        current.y1 !== previous.y1
      )
        return true;
    }
    const bounds = this.getBounds(0);
    const guard = (state.layer.guardPixels ?? this.options.guardPixels) / bounds.scale;
    return (
      (state.layer.scaleSensitive === true && bounds.scale !== previous.scale) ||
      bounds.x0 < previous.x0 + guard ||
      bounds.y0 < previous.y0 + guard ||
      bounds.x1 > previous.x1 - guard ||
      bounds.y1 > previous.y1 - guard
    );
  }

  private renderLive(state: ViewportLayerState, reason: string): void {
    if (state.layer.isActive?.() === false) {
      state.materializedBounds = null;
      return;
    }
    const bounds = this.getBounds(state.layer.overscanPixels ?? this.options.overscanPixels);
    const revision = state.revision;
    this.renderLayer(state.layer, { root: document, bounds, reason });
    state.materializedBounds = bounds;
    if (state.revision === revision) state.dirty = false;
  }

  private getLiveContext(): ViewportRenderContext {
    return { root: document, bounds: this.getBounds(this.options.overscanPixels) };
  }

  private cancelScheduledRender(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private renderLayer(layer: ViewportLayer, context: ViewportRenderContext): void {
    if (!PerformanceMetrics.active) {
      layer.render(context);
      return;
    }
    const start = performance.now();
    try {
      layer.render(context);
    } finally {
      PerformanceMetrics.record({
        layer: layer.id,
        reason: context.reason ?? "unknown",
        phase: "reconcile",
        start,
        duration: performance.now() - start
      });
    }
  }
}

const OVERSCAN_PIXELS = 80;
const GUARD_PIXELS = OVERSCAN_PIXELS / 2;

export const ViewportLayers = new ViewportRenderer({
  getViewport: () => ({ scale, x: viewX, y: viewY, width: svgWidth, height: svgHeight }),
  overscanPixels: OVERSCAN_PIXELS,
  guardPixels: GUARD_PIXELS
});
