// @vitest-environment jsdom
import { expect, it } from "vitest";
import { ReliefCoverage } from "./relief-coverage";
import type { ReadyReliefTile } from "./relief-raster";

it("retains cached image nodes and disjoint clip regions under one shared opacity", () => {
  document.body.innerHTML = '<svg><g id="terrain" opacity="0.8" filter="url(#effect)"></g></svg>';
  const terrain = document.querySelector("#terrain")!;
  const coverage = new ReliefCoverage();
  const tile: ReadyReliefTile = {
    key: "0",
    sourceKey: "high-0",
    sourcePixels: 1024,
    x: 0,
    y: 0,
    pixels: 512,
    url: "blob:zero",
    dispose: () => {}
  };
  const missing = { key: "1", x: 256, y: 0, pixels: 512 };
  const vectors = coverage.render(terrain, [tile], [missing]);
  const image = terrain.querySelector("image");
  expect(vectors.getAttribute("clip-path")).toMatch(/^url\(#relief-runtime-clip-/);
  expect(terrain.querySelector("clipPath rect")?.getAttribute("x")).toBe("256");
  expect(terrain.querySelectorAll("[opacity], [filter]")).toHaveLength(0);
  expect(terrain.getAttribute("opacity")).toBe("0.8");
  expect(coverage.render(terrain, [tile, { ...tile, ...missing, url: "blob:one" }], [])).toBe(vectors);
  expect(terrain.querySelector("image")).toBe(image);
  expect(terrain.querySelectorAll("clipPath rect")).toHaveLength(0);
  expect(terrain.querySelectorAll("image")).toHaveLength(2);
});
