import { describe, expect, it } from "vitest";
import { ARCHIVAL_APP_HOST, ARCHIVAL_USER_DATA_DIRECTORY, RENDERER_CACHE_CONTROL } from "./app-identity";

describe("archival desktop identity", () => {
  it("does not share the upstream application's renderer origin or profile", () => {
    expect(ARCHIVAL_APP_HOST).not.toBe("fmg");
    expect(ARCHIVAL_USER_DATA_DIRECTORY).not.toBe("fantasy-map-generator");
  });

  it("prevents packaged renderer files from going stale between installations", () => {
    expect(RENDERER_CACHE_CONTROL).toBe("no-store");
  });
});
