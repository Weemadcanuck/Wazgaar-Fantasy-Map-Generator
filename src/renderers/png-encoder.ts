/** One encoder for the sequential tile builder. Unsupported workers fall back to canvas.toBlob. */
export class PngEncoder {
  private worker: Worker | null = null;
  private failed = false;

  constructor(
    private readonly createWorker = () => new Worker(new URL("./png-worker.ts", import.meta.url), { type: "module" })
  ) {}

  async encode(
    context: CanvasRenderingContext2D,
    pixels: number,
    signal: AbortSignal,
    readback?: () => void
  ): Promise<Blob | null> {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (this.failed) return null;
    try {
      this.worker ??= this.createWorker();
    } catch {
      this.failed = true;
      return null;
    }
    const worker = this.worker;
    const image = context.getImageData(0, 0, pixels, pixels);
    readback?.();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
      };
      const stop = () => {
        cleanup();
        worker.terminate();
        this.worker = null;
      };
      const abort = () => {
        stop();
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const fallback = () => {
        stop();
        this.failed = true;
        resolve(null);
      };
      const timeout = setTimeout(fallback, 10000);
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = worker.onmessageerror = fallback;
      worker.onmessage = ({ data }: MessageEvent<{ blob?: Blob }>) => {
        if (!data.blob) return fallback();
        cleanup();
        resolve(data.blob);
      };
      try {
        worker.postMessage({ pixels, buffer: image.data.buffer }, [image.data.buffer]);
      } catch {
        fallback();
      }
    });
  }
}
