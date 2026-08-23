import { describe, expect, it } from "vitest";

// Smoke test for T0 (test runner + CI wiring) — proves `npm test` and the
// CI step actually execute and pass. Delete once real src/lib unit tests
// (chord math, import/export round-trip, etc.) land in later tasks.
describe("test runner smoke test", () => {
  it("runs and asserts basic arithmetic", () => {
    expect(1 + 1).toBe(2);
  });
});
