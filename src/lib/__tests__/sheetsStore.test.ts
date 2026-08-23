import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

// Vitest's default "node" pool doesn't expose the WebCrypto global the way a
// plain Node process or a browser does; polyfill it here (test-only) so
// `crypto.randomUUID()` in the store (a real browser global at runtime) works
// under test without changing the shared vitest.config.ts.
if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.randomUUID !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

// `useSheetsStore` is now wired to IndexedDB via zustand's `persist`
// middleware (T1b). Vitest's "node" environment has no real `indexedDB`
// global, so mock `idb-keyval` (the persistence adapter's only dependency)
// to simulate a healthy, empty store — CRUD tests below care about the
// store's synchronous behavior, not persistence itself (that's covered by
// sheetsPersistence.test.ts and the dedicated hydration tests below).
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

import { get as idbGet, set as idbSet } from "idb-keyval";
import { useSheetsStore } from "@/lib/store";

const mockedIdbGet = vi.mocked(idbGet);
const mockedIdbSet = vi.mocked(idbSet);

// Snapshot of the store's true, pristine initial state (seed data + actions,
// `hydrated: false`, `persistenceError: null`) so each test can reset to a
// known baseline without re-importing the module. `getInitialState()` always
// returns this same pristine object regardless of any hydration that may
// have run in the meantime (see zustand's persist middleware — it never
// mutates `configResult`), so this reset is deterministic even though
// hydration itself is asynchronous.
const initialState = useSheetsStore.getInitialState();

beforeEach(() => {
  useSheetsStore.setState(initialState, true);
});

describe("useSheetsStore seed data", () => {
  it("ships exactly 5 seed sheets", () => {
    expect(useSheetsStore.getState().sheets).toHaveLength(5);
  });

  it("starts unhydrated, with no persistence error, before rehydration completes", () => {
    const s = useSheetsStore.getState();
    expect(s.hydrated).toBe(false);
    expect(s.persistenceError).toBeNull();
  });

  it("gives DEAD AIR ON THE HIGHWAY the full sample content from ICD §5.1", () => {
    const sheet = useSheetsStore.getState().getSheet("sheet-seed-1");
    expect(sheet).toBeDefined();
    expect(sheet?.title).toBe("DEAD AIR ON THE HIGHWAY");
    expect(sheet?.key).toBe("E");
    expect(sheet?.bpm).toBe(96);
    expect(sheet?.timeSignature).toEqual({ beats: 4, unit: 4 });
    expect(sheet?.capo).toBe(0);
    expect(sheet?.transposeSemitones).toBe(0);
    expect(sheet?.sections).toHaveLength(2);
    expect(sheet?.sections[0].label).toBe("Verse 1");
    expect(sheet?.sections[0].lines[0].chordPlacements).toEqual([
      { charIndex: 0, chordId: "E5" },
      { charIndex: 18, chordId: "G5" },
    ]);
    expect(sheet?.chordOverrides).toEqual([]);
    expect(sheet?.annotations).toEqual([]);
  });

  it("gives the other 4 seed sheets metadata-only stubs", () => {
    const sheets = useSheetsStore.getState().sheets.filter((s) => s.id !== "sheet-seed-1");
    for (const sheet of sheets) {
      expect(sheet.sections).toEqual([]);
      expect(sheet.chordOverrides).toEqual([]);
      expect(sheet.annotations).toEqual([]);
    }
    expect(sheets.map((s) => [s.title, s.key, s.bpm])).toEqual([
      ["CHEAP AMPLIFIER", "A", 112],
      ["SIDE ONE, TRACK TWO", "D", 84],
      ["NIGHT SHIFT BLUES", "G", 72],
      ["BASEMENT TAPE", "C", 128],
    ]);
  });
});

describe("useSheetsStore.addSheet", () => {
  it("returns a fresh id and appends the sheet", () => {
    const id = useSheetsStore.getState().addSheet({ title: "New Song", bpm: 100 });
    const sheets = useSheetsStore.getState().sheets;
    expect(sheets).toHaveLength(6);
    expect(sheets.at(-1)?.id).toBe(id);
  });

  it("trims the title", () => {
    const id = useSheetsStore.getState().addSheet({ title: "  Padded Title  ", bpm: 100 });
    expect(useSheetsStore.getState().getSheet(id)?.title).toBe("Padded Title");
  });

  it("applies defaults for optional fields", () => {
    const id = useSheetsStore.getState().addSheet({ title: "Defaults", bpm: 100 });
    const sheet = useSheetsStore.getState().getSheet(id);
    expect(sheet?.timeSignature).toEqual({ beats: 4, unit: 4 });
    expect(sheet?.capo).toBe(0);
    expect(sheet?.transposeSemitones).toBe(0);
    expect(sheet?.sections).toEqual([]);
    expect(sheet?.chordOverrides).toEqual([]);
    expect(sheet?.annotations).toEqual([]);
    expect(sheet?.createdAt).toBe(sheet?.updatedAt);
  });

  it.each([
    [10, 30],
    [500, 240],
    [96, 96],
  ])("clamps bpm %i to %i", (input, expected) => {
    const id = useSheetsStore.getState().addSheet({ title: "BPM", bpm: input });
    expect(useSheetsStore.getState().getSheet(id)?.bpm).toBe(expected);
  });

  it("clamps timeSignature.beats into [1, 12]", () => {
    const id = useSheetsStore.getState().addSheet({
      title: "TS",
      bpm: 100,
      timeSignature: { beats: 20, unit: 4 },
    });
    expect(useSheetsStore.getState().getSheet(id)?.timeSignature.beats).toBe(12);
  });

  it("falls back timeSignature.unit to 4 when not in [2,4,8,16]", () => {
    const id = useSheetsStore.getState().addSheet({
      title: "TS",
      bpm: 100,
      timeSignature: { beats: 4, unit: 3 },
    });
    expect(useSheetsStore.getState().getSheet(id)?.timeSignature.unit).toBe(4);
  });

  it.each([
    [-5, 0],
    [50, 11],
    [7, 7],
  ])("clamps capo %i to %i", (input, expected) => {
    const id = useSheetsStore.getState().addSheet({ title: "Capo", bpm: 100, capo: input });
    expect(useSheetsStore.getState().getSheet(id)?.capo).toBe(expected);
  });

  it.each([
    [-50, -11],
    [50, 11],
    [3, 3],
  ])("clamps transposeSemitones %i to %i", (input, expected) => {
    const id = useSheetsStore.getState().addSheet({
      title: "Transpose",
      bpm: 100,
      transposeSemitones: input,
    });
    expect(useSheetsStore.getState().getSheet(id)?.transposeSemitones).toBe(expected);
  });

  it("clamps out-of-bounds chordPlacement charIndex into [0, lyrics.length]", () => {
    const id = useSheetsStore.getState().addSheet({
      title: "Chords",
      bpm: 100,
      sections: [
        {
          id: "sec-1",
          label: "Verse",
          lines: [
            {
              lyrics: "abc",
              chordPlacements: [
                { charIndex: -5, chordId: "E" },
                { charIndex: 999, chordId: "A" },
              ],
            },
          ],
        },
      ],
    });
    const sheet = useSheetsStore.getState().getSheet(id);
    expect(sheet?.sections[0].lines[0].chordPlacements).toEqual([
      { charIndex: 0, chordId: "E" },
      { charIndex: 3, chordId: "A" },
    ]);
  });
});

describe("useSheetsStore.updateSheet", () => {
  it("is a no-op when the id is not found", () => {
    const before = useSheetsStore.getState().sheets;
    useSheetsStore.getState().updateSheet("does-not-exist", { title: "X" });
    expect(useSheetsStore.getState().sheets).toEqual(before);
  });

  it("patches fields and bumps updatedAt", () => {
    const id = useSheetsStore.getState().addSheet({ title: "Original", bpm: 100 });
    const before = useSheetsStore.getState().getSheet(id)!;
    useSheetsStore.getState().updateSheet(id, { title: "  Renamed  " });
    const after = useSheetsStore.getState().getSheet(id)!;
    expect(after.title).toBe("Renamed");
    expect(after.createdAt).toBe(before.createdAt);
  });

  it("re-clamps bpm/timeSignature/capo/transposeSemitones on update", () => {
    const id = useSheetsStore.getState().addSheet({ title: "Clamp", bpm: 100 });
    useSheetsStore.getState().updateSheet(id, {
      bpm: 9999,
      timeSignature: { beats: -1, unit: 5 },
      capo: 99,
      transposeSemitones: -99,
    });
    const sheet = useSheetsStore.getState().getSheet(id);
    expect(sheet?.bpm).toBe(240);
    expect(sheet?.timeSignature).toEqual({ beats: 1, unit: 4 });
    expect(sheet?.capo).toBe(11);
    expect(sheet?.transposeSemitones).toBe(-11);
  });

  it("leaves id/createdAt untouched when a patch doesn't include them (excluded at the type level)", () => {
    const id = useSheetsStore.getState().addSheet({ title: "Immutable", bpm: 100 });
    const before = useSheetsStore.getState().getSheet(id)!;
    useSheetsStore.getState().updateSheet(id, { key: "G" });
    const after = useSheetsStore.getState().getSheet(id)!;
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toBe(before.createdAt);
  });
});

describe("useSheetsStore.removeSheet", () => {
  it("removes an existing sheet", () => {
    const id = useSheetsStore.getState().addSheet({ title: "Temp", bpm: 100 });
    useSheetsStore.getState().removeSheet(id);
    expect(useSheetsStore.getState().getSheet(id)).toBeUndefined();
  });

  it("is a no-op when the id is not found", () => {
    const before = useSheetsStore.getState().sheets;
    useSheetsStore.getState().removeSheet("does-not-exist");
    expect(useSheetsStore.getState().sheets).toEqual(before);
  });
});

describe("useSheetsStore.getSheet", () => {
  it("returns undefined for an unknown id", () => {
    expect(useSheetsStore.getState().getSheet("nope")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T5a — duplicateSheet (sheets-icd-v2.md §6.10)
// ---------------------------------------------------------------------------

describe("useSheetsStore.duplicateSheet", () => {
  function seedSheetWithAnnotations() {
    const id = useSheetsStore.getState().addSheet({
      title: "Original Song",
      key: "E",
      bpm: 100,
      capo: 2,
      transposeSemitones: 1,
      chordOverrides: [{ chordId: "E5", guitarFrets: ["0", "2", "2", "x", "x", "x"], pianoKeys: ["E3", "B3"] }],
      sections: [
        {
          id: "sec-a",
          label: "Verse",
          lines: [{ lyrics: "hello world", chordPlacements: [{ charIndex: 0, chordId: "E5" }] }],
        },
        { id: "sec-b", label: "Chorus", lines: [{ lyrics: "chorus line", chordPlacements: [] }] },
      ],
    });
    // Annotations are appended via updateSheet since addSheet's
    // NewSheetInput doesn't require pre-existing annotation ids here.
    useSheetsStore.getState().updateSheet(id, {
      annotations: [
        { id: "ann-1", type: "note", target: { sectionId: "sec-a", lineIndex: 0 }, content: "A note" },
        { id: "ann-2", type: "highlight", target: { sectionId: "sec-b", lineIndex: 0, range: [0, 3] } },
      ],
    });
    return id;
  }

  it("returns null (no-op) when the id is not found", () => {
    const before = useSheetsStore.getState().sheets;
    expect(useSheetsStore.getState().duplicateSheet("does-not-exist")).toBeNull();
    expect(useSheetsStore.getState().sheets).toEqual(before);
  });

  it("appends '(Copy)' to the title and copies metadata verbatim", () => {
    const id = seedSheetWithAnnotations();
    const newId = useSheetsStore.getState().duplicateSheet(id);
    expect(newId).not.toBeNull();
    const copy = useSheetsStore.getState().getSheet(newId!)!;
    const original = useSheetsStore.getState().getSheet(id)!;
    expect(copy.title).toBe("Original Song (Copy)");
    expect(copy.key).toBe(original.key);
    expect(copy.bpm).toBe(original.bpm);
    expect(copy.timeSignature).toEqual(original.timeSignature);
    expect(copy.capo).toBe(original.capo);
    expect(copy.transposeSemitones).toBe(original.transposeSemitones);
    expect(copy.chordOverrides).toEqual(original.chordOverrides);
  });

  it("gives the copy a fresh top-level id and fresh createdAt/updatedAt", () => {
    const id = seedSheetWithAnnotations();
    const original = useSheetsStore.getState().getSheet(id)!;
    const newId = useSheetsStore.getState().duplicateSheet(id)!;
    const copy = useSheetsStore.getState().getSheet(newId)!;
    expect(newId).not.toBe(id);
    expect(copy.id).not.toBe(original.id);
  });

  it("regenerates every Section.id and Annotation.id — copy and original have completely disjoint ids", () => {
    const id = seedSheetWithAnnotations();
    const original = useSheetsStore.getState().getSheet(id)!;
    const newId = useSheetsStore.getState().duplicateSheet(id)!;
    const copy = useSheetsStore.getState().getSheet(newId)!;

    const originalSectionIds = new Set(original.sections.map((s) => s.id));
    const copySectionIds = copy.sections.map((s) => s.id);
    expect(copySectionIds).toHaveLength(original.sections.length);
    for (const sid of copySectionIds) expect(originalSectionIds.has(sid)).toBe(false);

    const originalAnnotationIds = new Set(original.annotations.map((a) => a.id));
    const copyAnnotationIds = copy.annotations.map((a) => a.id);
    expect(copyAnnotationIds).toHaveLength(original.annotations.length);
    for (const aid of copyAnnotationIds) expect(originalAnnotationIds.has(aid)).toBe(false);
  });

  it("remaps each copied annotation's target.sectionId to the copy's own new Section.id", () => {
    const id = seedSheetWithAnnotations();
    const original = useSheetsStore.getState().getSheet(id)!;
    const newId = useSheetsStore.getState().duplicateSheet(id)!;
    const copy = useSheetsStore.getState().getSheet(newId)!;

    // Original section order is preserved positionally (sec-a, sec-b).
    const [copySecA, copySecB] = copy.sections;
    const [origSecA, origSecB] = original.sections;
    expect(copySecA.label).toBe(origSecA.label);
    expect(copySecB.label).toBe(origSecB.label);

    const copyNote = copy.annotations.find((a) => a.type === "note")!;
    const copyHighlight = copy.annotations.find((a) => a.type === "highlight")!;
    expect(copyNote.target.sectionId).toBe(copySecA.id);
    expect(copyHighlight.target.sectionId).toBe(copySecB.id);
    // And every copy annotation's sectionId actually resolves to one of the
    // copy's own sections — never a stale id from the original.
    const copySectionIdSet = new Set(copy.sections.map((s) => s.id));
    for (const a of copy.annotations) expect(copySectionIdSet.has(a.target.sectionId)).toBe(true);
  });

  it("produces an independent copy — mutating the copy never touches the original", () => {
    const id = seedSheetWithAnnotations();
    const newId = useSheetsStore.getState().duplicateSheet(id)!;
    useSheetsStore.getState().updateSheet(newId, { title: "Mutated Copy" });
    const original = useSheetsStore.getState().getSheet(id)!;
    expect(original.title).toBe("Original Song");
  });

  it("is not idempotent — calling it twice produces two independent copies", () => {
    const id = seedSheetWithAnnotations();
    const firstCopyId = useSheetsStore.getState().duplicateSheet(id)!;
    const secondCopyId = useSheetsStore.getState().duplicateSheet(id)!;
    expect(firstCopyId).not.toBe(secondCopyId);
    expect(useSheetsStore.getState().getSheet(firstCopyId)).toBeDefined();
    expect(useSheetsStore.getState().getSheet(secondCopyId)).toBeDefined();
  });
});

describe("useSheetsStore hydration & persistence (T1b)", () => {
  it("becomes hydrated with no persistence error once rehydration completes against a healthy, empty store", async () => {
    mockedIdbGet.mockResolvedValue(undefined);
    await useSheetsStore.persist.rehydrate();
    const s = useSheetsStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.persistenceError).toBeNull();
    // No persisted value existed — falls back to (still-present) seed data.
    expect(s.sheets).toHaveLength(5);
  });

  it("hydrates `sheets` from a well-formed persisted value", async () => {
    const persistedSheet = useSheetsStore.getState().sheets[0];
    mockedIdbGet.mockResolvedValue({
      state: { sheets: [persistedSheet] },
      version: 0,
    });
    await useSheetsStore.persist.rehydrate();
    const s = useSheetsStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.persistenceError).toBeNull();
    expect(s.sheets).toEqual([persistedSheet]);
  });

  it("falls back to seed data (console.warn, no persistenceError) when persisted data is corrupt", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockedIdbGet.mockResolvedValue({ state: { sheets: "not-an-array" }, version: 0 });
    await useSheetsStore.persist.rehydrate();
    const s = useSheetsStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.persistenceError).toBeNull();
    expect(s.sheets).toHaveLength(5);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("sets persistenceError (but still becomes hydrated, falling back to seed data) when the storage read fails", async () => {
    mockedIdbGet.mockRejectedValue(new Error("IndexedDB disabled"));
    await useSheetsStore.persist.rehydrate();
    const s = useSheetsStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.persistenceError).toEqual(expect.stringContaining("Storage unavailable"));
    expect(s.sheets).toHaveLength(5);
  });

  it("does not recurse/hang when both reads and writes fail (regression: reporting a persistenceError writes state, which persist itself tries to save, which can fail again)", async () => {
    mockedIdbGet.mockRejectedValue(new Error("IndexedDB disabled"));
    mockedIdbSet.mockRejectedValue(new Error("IndexedDB disabled"));
    mockedIdbSet.mockClear();
    await useSheetsStore.persist.rehydrate();
    const s = useSheetsStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.persistenceError).toEqual(expect.stringContaining("Storage unavailable"));
    // Every genuinely new state change (the error report, then `hydrated:
    // true`) triggers one persist write attempt each; a re-entrancy bug
    // would call `set` unboundedly instead of a small, fixed number of times.
    expect(mockedIdbSet.mock.calls.length).toBeLessThan(5);
  });
});
