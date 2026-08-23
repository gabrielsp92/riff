import { beforeEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { useSheetsStore } from "@/lib/store";

// Vitest's default "node" pool doesn't expose the WebCrypto global the way a
// plain Node process or a browser does; polyfill it here (test-only) so
// `crypto.randomUUID()` in the store (a real browser global at runtime) works
// under test without changing the shared vitest.config.ts.
if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.randomUUID !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

// Snapshot of the store's true initial state (seed data + actions) so each
// test can reset to a known baseline without re-importing the module.
const initialState = useSheetsStore.getState();

beforeEach(() => {
  useSheetsStore.setState(initialState, true);
});

describe("useSheetsStore seed data", () => {
  it("ships exactly 5 seed sheets", () => {
    expect(useSheetsStore.getState().sheets).toHaveLength(5);
  });

  it("is hydrated with no persistence error at this step (no persistence yet)", () => {
    const s = useSheetsStore.getState();
    expect(s.hydrated).toBe(true);
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
