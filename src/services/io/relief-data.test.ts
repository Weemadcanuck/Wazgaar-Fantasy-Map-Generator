import { describe, expect, it } from "vitest";
import type { ReliefIcon } from "@/generators/relief-generator";
import { restoreReliefData, serializeReliefData } from "./relief-data";

describe("relief save field", () => {
  it("round-trips missing, empty and populated data as distinct states without extra fields", () => {
    const cases: Array<ReliefIcon[] | undefined> = [undefined, [], [{ icon: "relief-mount-1", x: 3, y: 4, s: 5 }]];
    for (const relief of cases) {
      const target: { relief?: ReliefIcon[] } = { relief: [] };
      const field = serializeReliefData(relief);
      restoreReliefData(target, field);
      expect(target.relief).toEqual(relief);
      expect(field).toBe(relief === undefined ? "" : JSON.stringify(relief));
      expect(serializeReliefData(target.relief)).toBe(field);
    }
  });

  it("rejects malformed saved JSON instead of silently regenerating over it", () => {
    expect(() => restoreReliefData({}, "{broken")).toThrow();
  });
});
