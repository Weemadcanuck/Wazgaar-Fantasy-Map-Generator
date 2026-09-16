export {};

self.onmessage = async ({ data }: MessageEvent<{ pixels: number; buffer: ArrayBuffer }>) => {
  const canvas = new OffscreenCanvas(data.pixels, data.pixels);
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Relief PNG canvas unavailable");
    context.putImageData(new ImageData(new Uint8ClampedArray(data.buffer), data.pixels, data.pixels), 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    self.postMessage({ blob });
  } catch {
    self.postMessage({ failed: true });
  } finally {
    canvas.width = canvas.height = 0;
  }
};
