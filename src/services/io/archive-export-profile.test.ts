// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ARCHIVE_FULL_SNAPSHOT_OPTIONS,
  ARCHIVE_REFERENCE_SAFE_OPTIONS,
  loadArchiveSimulationOptions,
  saveArchiveSimulationOptions
} from "./archive-export-profile";

beforeEach(() => localStorage.clear());

describe("Archive export profile", () => {
  it("defaults every optional simulation category off", () => {
    expect(loadArchiveSimulationOptions(localStorage, 10)).toEqual(ARCHIVE_REFERENCE_SAFE_OPTIONS);
  });

  it("stores profiles independently by map id", () => {
    saveArchiveSimulationOptions(localStorage, 10, ARCHIVE_FULL_SNAPSHOT_OPTIONS);

    expect(loadArchiveSimulationOptions(localStorage, 10)).toEqual(ARCHIVE_FULL_SNAPSHOT_OPTIONS);
    expect(loadArchiveSimulationOptions(localStorage, 11)).toEqual(ARCHIVE_REFERENCE_SAFE_OPTIONS);
  });

  it("falls back safely when stored profile data is corrupt", () => {
    localStorage.setItem("archive-export-profile:10", "not json");
    expect(loadArchiveSimulationOptions(localStorage, 10)).toEqual(ARCHIVE_REFERENCE_SAFE_OPTIONS);
  });
});
