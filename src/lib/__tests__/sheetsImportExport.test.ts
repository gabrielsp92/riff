import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.randomUUID !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

// `useSheetsStore` (imported transitively) is wired to IndexedDB via
// `persist` — mock `idb-keyval` so these tests run deterministically without
// a real IndexedDB (see sheetsStore.test.ts for the same pattern).
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

import { Sheet, useSheetsStore } from "@/lib/store";
import { exportLibrary, exportSheet, importFile } from "@/lib/sheetsImportExport";

const initialState = useSheetsStore.getInitialState();

beforeEach(() => {
  useSheetsStore.setState(initialState, true);
});

const FULL_SHEET: Sheet = {
  id: "sheet-seed-1",
  title: "IMPORT EXPORT TEST SHEET",
  key: "E",
  bpm: 96,
  timeSignature: { beats: 4, unit: 4 },
  capo: 0,
  transposeSemitones: 0,
  sections: [
    {
      id: "sec-verse-1",
      label: "Verse 1",
      lines: [
        {
          lyrics: "Headlights on the county line",
          chordPlacements: [
            { charIndex: 0, chordId: "E5" },
            { charIndex: 18, chordId: "G5" },
          ],
        },
      ],
    },
  ],
  chordOverrides: [{ chordId: "G5", guitarFrets: ["3", "5", "5", "x", "x", "x"], pianoKeys: ["G3", "D4"] }],
  annotations: [
    { id: "ann-1", type: "note", target: { sectionId: "sec-verse-1", lineIndex: 0 }, content: "Play softer here" },
    { id: "ann-2", type: "highlight", target: { sectionId: "sec-verse-1", lineIndex: 0, range: [0, 10] } },
  ],
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("exportSheet", () => {
  it("returns null for an unknown id", () => {
    expect(exportSheet("does-not-exist")).toBeNull();
  });

  it("exports an existing sheet with formatVersion 1 and kind 'sheet'", () => {
    const id = useSheetsStore.getState().addSheet(FULL_SHEET);
    const exported = exportSheet(id);
    expect(exported?.formatVersion).toBe(1);
    expect(exported?.kind).toBe("sheet");
    expect(exported?.sheet.id).toBe(id);
    expect(typeof exported?.exportedAt).toBe("string");
  });
});

describe("exportLibrary", () => {
  it("never empty-fails — an empty library is valid", () => {
    // Clear the store entirely.
    for (const s of useSheetsStore.getState().sheets) {
      useSheetsStore.getState().removeSheet(s.id);
    }
    const exported = exportLibrary();
    expect(exported.formatVersion).toBe(1);
    expect(exported.kind).toBe("library");
    expect(exported.sheets).toEqual([]);
  });

  it("exports every sheet currently in the store", () => {
    const exported = exportLibrary();
    expect(exported.sheets).toHaveLength(useSheetsStore.getState().sheets.length);
  });
});

describe("importFile — round-trip losslessness", () => {
  it("reproduces every field of a full sheet except id/createdAt/updatedAt", () => {
    const id = useSheetsStore.getState().addSheet(FULL_SHEET);
    const exported = exportSheet(id)!;
    const result = importFile(exported);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(1);

    const imported = useSheetsStore.getState().getSheet(result.importedSheetIds[0])!;
    expect(imported.id).not.toBe(exported.sheet.id);
    expect(imported.title).toBe(exported.sheet.title);
    expect(imported.key).toBe(exported.sheet.key);
    expect(imported.bpm).toBe(exported.sheet.bpm);
    expect(imported.timeSignature).toEqual(exported.sheet.timeSignature);
    expect(imported.capo).toBe(exported.sheet.capo);
    expect(imported.transposeSemitones).toBe(exported.sheet.transposeSemitones);
    expect(imported.sections).toEqual(exported.sheet.sections);
    expect(imported.chordOverrides).toEqual(exported.sheet.chordOverrides);
    expect(imported.annotations).toEqual(exported.sheet.annotations);
  });

  it("round-trips a library export losslessly for every sheet", () => {
    const exported = exportLibrary();
    const result = importFile(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(exported.sheets.length);
  });
});

describe("importFile — double import yields two sheets", () => {
  it("re-importing the same file twice appends two distinct sheets, never overwrites", () => {
    const id = useSheetsStore.getState().addSheet(FULL_SHEET);
    const exported = exportSheet(id)!;

    const first = importFile(exported);
    const second = importFile(exported);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.importedSheetIds[0]).not.toBe(second.importedSheetIds[0]);
    const sheetsWithTitle = useSheetsStore
      .getState()
      .sheets.filter((s) => s.title === FULL_SHEET.title);
    // The original + two imports.
    expect(sheetsWithTitle).toHaveLength(3);
  });
});

describe("importFile — malformed file (ICD §5.5)", () => {
  it("returns malformed_sheet naming the first missing field", () => {
    const result = importFile({ formatVersion: 1, kind: "sheet", sheet: { title: "X" } });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "malformed_sheet",
        message: 'Sheet is missing required field "bpm".',
        details: { field: "bpm" },
      },
    });
  });

  it("never partially imports — the store gains no sheets on failure", () => {
    const before = useSheetsStore.getState().sheets.length;
    importFile({ formatVersion: 1, kind: "sheet", sheet: { title: "X" } });
    expect(useSheetsStore.getState().sheets.length).toBe(before);
  });
});

describe("importFile — other invalid inputs, never throws", () => {
  it.each([
    [null, "invalid_json"],
    [undefined, "invalid_json"],
    ["a string", "invalid_json"],
    [42, "invalid_json"],
    [[], "invalid_json"],
    // `{}` is a plain object, so it clears the `isPlainObject` check, but has
    // no `formatVersion` — that's reported as `unsupported_format_version`
    // per sheets-icd.md §3.3 ("rejects any other value ... rather than
    // guessing"), not `invalid_json`.
    [{}, "unsupported_format_version"],
  ])("does not throw on %j and returns %s", (input, expectedCode) => {
    expect(() => importFile(input)).not.toThrow();
    const result = importFile(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(expectedCode);
  });

  it("rejects an unsupported format version", () => {
    const result = importFile({ formatVersion: 2, kind: "sheet", sheet: {} });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "unsupported_format_version",
        message: 'Unsupported export format version "2".',
        details: { formatVersion: 2 },
      },
    });
  });

  it("rejects an unrecognized kind", () => {
    const result = importFile({ formatVersion: 1, kind: "not-a-real-kind" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_json");
  });

  it("rejects a chordPlacement charIndex out of bounds", () => {
    const badSheet = {
      ...FULL_SHEET,
      sections: [
        {
          id: "sec-1",
          label: "Verse",
          lines: [{ lyrics: "abc", chordPlacements: [{ charIndex: 999, chordId: "E" }] }],
        },
      ],
    };
    const result = importFile({ formatVersion: 1, kind: "sheet", exportedAt: "now", sheet: badSheet });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("malformed_sheet");
      expect(result.error.details).toEqual({ field: "sections[0].lines[0].chordPlacements[0].charIndex" });
    }
  });

  it("rejects an annotation with an invalid type", () => {
    const badSheet = {
      ...FULL_SHEET,
      annotations: [{ id: "a1", type: "banner", target: { sectionId: "sec-verse-1", lineIndex: 0 } }],
    };
    const result = importFile({ formatVersion: 1, kind: "sheet", exportedAt: "now", sheet: badSheet });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("malformed_sheet");
      expect(result.error.details).toEqual({ field: "annotations[0].type" });
    }
  });

  it("rejects a note annotation missing required content", () => {
    const badSheet = {
      ...FULL_SHEET,
      annotations: [{ id: "a1", type: "note", target: { sectionId: "sec-verse-1", lineIndex: 0 } }],
    };
    const result = importFile({ formatVersion: 1, kind: "sheet", exportedAt: "now", sheet: badSheet });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("malformed_sheet");
      expect(result.error.details).toEqual({ field: "annotations[0].content" });
    }
  });

  it("fails an entire library import (no partial import) when one of several sheets is malformed", () => {
    const before = useSheetsStore.getState().sheets.length;
    const goodSheet = exportSheet(useSheetsStore.getState().sheets[0].id)!.sheet;
    const result = importFile({
      formatVersion: 1,
      kind: "library",
      exportedAt: "now",
      sheets: [goodSheet, { title: "Missing bpm" }],
    });
    expect(result.ok).toBe(false);
    expect(useSheetsStore.getState().sheets.length).toBe(before);
  });
});
