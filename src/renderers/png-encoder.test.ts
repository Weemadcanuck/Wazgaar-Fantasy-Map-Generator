import { afterEach, describe, expect, it, vi } from "vitest";
import { PngEncoder } from "./png-encoder";

function setup() {
  const workers: Worker[] = [];
  const create = vi.fn(() => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null };
    workers.push(worker as unknown as Worker);
    return worker as unknown as Worker;
  });
  const context = { getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16) })) };
  return {
    encoder: new PngEncoder(create),
    workers,
    create,
    context: context as unknown as CanvasRenderingContext2D
  };
}

function reply(worker: Worker, data: object): void {
  worker.onmessage?.call(worker, new MessageEvent("message", { data }));
}

afterEach(() => vi.useRealTimers());

describe("relief PNG worker", () => {
  it("transfers pixels and reuses one worker for sequential tiles", async () => {
    const { encoder, workers, create, context } = setup();
    const signal = new AbortController().signal;
    const blob = new Blob(["png"], { type: "image/png" });
    for (let i = 0; i < 2; i++) {
      const pending = encoder.encode(context, 2, signal);
      const worker = workers[0];
      const [message, transfer] = vi.mocked(worker.postMessage).mock.calls[i];
      expect(message.pixels).toBe(2);
      expect(transfer).toEqual([message.buffer]);
      reply(worker, { blob });
      expect(await pending).toBe(blob);
      expect(worker.onmessage).toBeNull();
    }
    expect(create).toHaveBeenCalledOnce();
  });

  it("terminates cancelled work and creates a fresh worker for the next revision", async () => {
    const { encoder, workers, context } = setup();
    const controller = new AbortController();
    const pending = encoder.encode(context, 2, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[0].onmessage).toBeNull();
    const next = encoder.encode(context, 2, new AbortController().signal);
    expect(workers).toHaveLength(2);
    const blob = new Blob(["new"]);
    reply(workers[1], { blob });
    expect(await next).toBe(blob);
  });

  it("falls back once after worker failure without repeatedly reading pixels", async () => {
    const { encoder, workers, create, context } = setup();
    const signal = new AbortController().signal;
    const pending = encoder.encode(context, 2, signal);
    reply(workers[0], { failed: true });
    expect(await pending).toBeNull();
    expect(await encoder.encode(context, 2, signal)).toBeNull();
    expect(create).toHaveBeenCalledOnce();
    expect(context.getImageData).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("bounds a stalled worker and handles browsers that cannot create workers", async () => {
    vi.useFakeTimers();
    const { encoder, workers, context } = setup();
    const pending = encoder.encode(context, 2, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toBeNull();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const unsupported = new PngEncoder(() => {
      throw new Error("Unsupported");
    });
    expect(await unsupported.encode(context, 2, new AbortController().signal)).toBeNull();
  });

  it("rejects an already cancelled request before allocating", async () => {
    const { encoder, create, context } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(encoder.encode(context, 2, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(create).not.toHaveBeenCalled();
    expect(context.getImageData).not.toHaveBeenCalled();
  });
});
