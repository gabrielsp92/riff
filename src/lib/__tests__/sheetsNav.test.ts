import { beforeEach, describe, expect, it, vi } from "vitest";

// `store.ts` also wires useSheetsStore to IndexedDB via `persist` — mock
// idb-keyval so importing the module is deterministic (see sheetsStore.test.ts
// for the same pattern); useSheetsNavStore/filterSheets don't touch
// useSheetsStore at all, but they live in the same module.
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

import { Sheet, filterSheets, useSheetsNavStore } from "@/lib/store";

const initialNavState = useSheetsNavStore.getInitialState();

beforeEach(() => {
  useSheetsNavStore.setState(initialNavState, true);
});

describe("useSheetsNavStore", () => {
  it("starts on the list screen", () => {
    expect(useSheetsNavStore.getState().screen).toEqual({ name: "list" });
  });

  it("openViewer navigates to the viewer screen for a given sheet id", () => {
    useSheetsNavStore.getState().openViewer("sheet-1");
    expect(useSheetsNavStore.getState().screen).toEqual({ name: "viewer", sheetId: "sheet-1" });
  });

  it("openEditor(null) navigates to the editor screen for a new, unsaved sheet", () => {
    useSheetsNavStore.getState().openEditor(null);
    expect(useSheetsNavStore.getState().screen).toEqual({ name: "editor", sheetId: null });
  });

  it("openEditor(id) navigates to the editor screen for an existing sheet", () => {
    useSheetsNavStore.getState().openEditor("sheet-1");
    expect(useSheetsNavStore.getState().screen).toEqual({ name: "editor", sheetId: "sheet-1" });
  });

  it("openList returns to the list screen from any other screen", () => {
    useSheetsNavStore.getState().openViewer("sheet-1");
    useSheetsNavStore.getState().openList();
    expect(useSheetsNavStore.getState().screen).toEqual({ name: "list" });
  });
});

describe("filterSheets", () => {
  const sheets: Sheet[] = [
    { id: "1", title: "DEAD AIR ON THE HIGHWAY", key: "E", bpm: 96, timeSignature: { beats: 4, unit: 4 }, capo: 0, transposeSemitones: 0, sections: [], chordOverrides: [], annotations: [], createdAt: "", updatedAt: "" },
    { id: "2", title: "CHEAP AMPLIFIER", key: "A", bpm: 112, timeSignature: { beats: 4, unit: 4 }, capo: 0, transposeSemitones: 0, sections: [], chordOverrides: [], annotations: [], createdAt: "", updatedAt: "" },
    { id: "3", title: "SIDE ONE, TRACK TWO", key: "D", bpm: 84, timeSignature: { beats: 4, unit: 4 }, capo: 0, transposeSemitones: 0, sections: [], chordOverrides: [], annotations: [], createdAt: "", updatedAt: "" },
    { id: "4", title: "NO KEY SET", bpm: 100, timeSignature: { beats: 4, unit: 4 }, capo: 0, transposeSemitones: 0, sections: [], chordOverrides: [], annotations: [], createdAt: "", updatedAt: "" },
    { id: "5", title: "QUIET SONG", key: "Z", bpm: 90, timeSignature: { beats: 4, unit: 4 }, capo: 0, transposeSemitones: 0, sections: [], chordOverrides: [], annotations: [], createdAt: "", updatedAt: "" },
  ];

  it("returns all sheets unchanged for an empty query", () => {
    expect(filterSheets(sheets, "")).toBe(sheets);
  });

  it("returns all sheets unchanged for a whitespace-only query", () => {
    expect(filterSheets(sheets, "   ")).toBe(sheets);
  });

  it("matches by title, case-insensitively", () => {
    expect(filterSheets(sheets, "dead air")).toEqual([sheets[0]]);
    expect(filterSheets(sheets, "AMPLIFIER")).toEqual([sheets[1]]);
  });

  it("matches by key, case-insensitively, even when the title doesn't match", () => {
    // "QUIET SONG"'s title contains no "z" — only its key "Z" does.
    expect(filterSheets(sheets, "z")).toEqual([sheets[4]]);
    expect(filterSheets(sheets, "Z")).toEqual([sheets[4]]);
  });

  it("does not throw when a sheet has no key", () => {
    expect(() => filterSheets(sheets, "no key set")).not.toThrow();
    expect(filterSheets(sheets, "no key set")).toEqual([sheets[3]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSheets(sheets, "zzz-no-match")).toEqual([]);
  });
});
