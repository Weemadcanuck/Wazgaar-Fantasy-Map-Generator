import type { ReadyReliefTile, ReliefTile } from "./relief-raster";
import { TILE_SIZE } from "./relief-raster";

const NS = "http://www.w3.org/2000/svg";
let nextClip = 0;

/** Disjoint raster tiles and one clipped vector group share the terrain's opacity/filter exactly once. */
export class ReliefCoverage {
  private root: Element | null = null;
  private vectors: SVGGElement | null = null;
  private clip: SVGClipPathElement | null = null;
  private images = new Map<string, SVGImageElement>();
  private rectangles = new Map<string, SVGRectElement>();

  get imageCount(): number {
    return this.images.size;
  }

  reset(): void {
    this.root = null;
    this.vectors = null;
    this.clip = null;
    this.images.clear();
    this.rectangles.clear();
  }

  render(root: Element, ready: ReadyReliefTile[], missing: ReliefTile[]): SVGGElement {
    const doc = root.ownerDocument;
    if (this.root !== root || this.vectors?.parentElement !== root) {
      this.reset();
      this.root = root;
      const defs = doc.createElementNS(NS, "defs");
      this.clip = doc.createElementNS(NS, "clipPath");
      this.clip.id = `relief-runtime-clip-${++nextClip}`;
      this.clip.setAttribute("clipPathUnits", "userSpaceOnUse");
      defs.append(this.clip);
      this.vectors = doc.createElementNS(NS, "g");
      this.vectors.setAttribute("clip-path", `url(#${this.clip.id})`);
      this.vectors.dataset.reliefCoverage = "vectors";
      root.replaceChildren(defs, this.vectors);
    }
    const readyKeys = new Set(ready.map(tile => `${tile.x},${tile.y}`));
    for (const [key, image] of this.images) {
      if (readyKeys.has(key)) continue;
      image.remove();
      this.images.delete(key);
    }
    for (const tile of ready) {
      const key = `${tile.x},${tile.y}`;
      let image = this.images.get(key);
      if (!image) {
        image = doc.createElementNS(NS, "image");
        image.setAttribute("x", String(tile.x));
        image.setAttribute("y", String(tile.y));
        image.setAttribute("width", String(TILE_SIZE));
        image.setAttribute("height", String(TILE_SIZE));
        image.setAttribute("preserveAspectRatio", "none");
        this.images.set(key, image);
        root.insertBefore(image, this.vectors);
      }
      if (image.getAttribute("href") !== tile.url) image.setAttribute("href", tile.url);
    }
    const missingKeys = new Set(missing.map(tile => `${tile.x},${tile.y}`));
    for (const [key, rect] of this.rectangles) {
      if (missingKeys.has(key)) continue;
      rect.remove();
      this.rectangles.delete(key);
    }
    for (const tile of missing) {
      const key = `${tile.x},${tile.y}`;
      if (this.rectangles.has(key)) continue;
      const rect = doc.createElementNS(NS, "rect");
      rect.setAttribute("x", String(tile.x));
      rect.setAttribute("y", String(tile.y));
      rect.setAttribute("width", String(TILE_SIZE));
      rect.setAttribute("height", String(TILE_SIZE));
      this.clip!.append(rect);
      this.rectangles.set(key, rect);
    }
    return this.vectors!;
  }
}
