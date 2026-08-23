import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

// Same WebCrypto polyfill as sheetsStore.test.ts — Vitest's "node" pool
// doesn't expose it by default, and useSheetEditorStore's mutators (like
// useSheetsStore's) call `crypto.randomUUID()` for fresh Section/Annotation
// ids.
if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.randomUUID !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

// Same idb-keyval mock as sheetsStore.test.ts — `useSheetEditorStore.load`/
// `.save` route through `useSheetsStore`, which is wired to IndexedDB via
// zustand's `persist` middleware; mock its only dependency so tests exercise
// synchronous store behavior only.
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

import { tokenizeWords, useSheetEditorStore, useSheetsStore } from "@/lib/store";

const initialSheetsState = useSheetsStore.getInitialState();
const initialEditorState = useSheetEditorStore.getInitialState();

beforeEach(() => {
  useSheetsStore.setState(initialSheetsState, true);
  useSheetEditorStore.setState(initialEditorState, true);
});

// ---------------------------------------------------------------------------
// T5a — tokenizeWords (sheets-icd-v2.md §6.6)
// ---------------------------------------------------------------------------

describe("tokenizeWords (ICD v2 §6.6)", () => {
  it("worked example", () => {
    expect(tokenizeWords("Headlights on the county line")).toEqual([
      { text: "Headlights", charIndex: 0 },
      { text: "on", charIndex: 11 },
      { text: "the", charIndex: 14 },
      { text: "county", charIndex: 18 },
      { text: "line", charIndex: 25 },
    ]);
  });

  it("returns [] for an empty or whitespace-only string", () => {
    expect(tokenizeWords("")).toEqual([]);
    expect(tokenizeWords("   ")).toEqual([]);
  });

  it("handles multiple consecutive spaces without producing empty tokens", () => {
    expect(tokenizeWords("a   b")).toEqual([
      { text: "a", charIndex: 0 },
      { text: "b", charIndex: 4 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// T5a — useSheetEditorStore (sheets-icd-v2.md §6.1)
// ---------------------------------------------------------------------------

describe("useSheetEditorStore.load", () => {
  it("load(null) gives a blank template", () => {
    useSheetEditorStore.getState().load(null);
    const s = useSheetEditorStore.getState();
    expect(s.editingSheetId).toBeNull();
    expect(s.notFound).toBe(false);
    expect(s.draft).toEqual({
      title: "",
      key: undefined,
      bpm: 120,
      timeSignature: { beats: 4, unit: 4 },
      capo: 0,
      transposeSemitones: 0,
      sections: [],
      chordOverrides: [],
      annotations: [],
    });
  });

  it("load(id) for an existing sheet deep-copies it, never a live reference", () => {
    const id = useSheetsStore.getState().addSheet({
      title: "My Song",
      bpm: 90,
      sections: [{ id: "sec-1", label: "Verse", lines: [{ lyrics: "la la", chordPlacements: [] }] }],
    });
    useSheetEditorStore.getState().load(id);
    const s = useSheetEditorStore.getState();
    expect(s.editingSheetId).toBe(id);
    expect(s.notFound).toBe(false);
    expect(s.draft?.title).toBe("My Song");
    expect(s.draft?.sections).toEqual([{ id: "sec-1", label: "Verse", lines: [{ lyrics: "la la", chordPlacements: [] }] }]);

    // Mutating the draft must not mutate the persisted sheet.
    useSheetEditorStore.getState().updateSectionLabel("sec-1", "Chorus");
    expect(useSheetsStore.getState().getSheet(id)?.sections[0].label).toBe("Verse");
  });

  it("load(id) for a missing id sets notFound and a null draft", () => {
    useSheetEditorStore.getState().load("does-not-exist");
    const s = useSheetEditorStore.getState();
    expect(s.draft).toBeNull();
    expect(s.editingSheetId).toBe("does-not-exist");
    expect(s.notFound).toBe(true);
  });
});

describe("useSheetEditorStore.setLineLyrics — Assumption H (ICD v2 §6.1)", () => {
  function loadDraftWithLine() {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    useSheetEditorStore.getState().addLine(sectionId);
    useSheetEditorStore.getState().setLineLyrics(sectionId, 0, "hello world");
    useSheetEditorStore.getState().setChordPlacement(sectionId, 0, 0, "E5");
    useSheetEditorStore.getState().addAnnotation({
      type: "highlight",
      target: { sectionId, lineIndex: 0, range: [0, 5] },
    });
    useSheetEditorStore.getState().addAnnotation({
      type: "note",
      target: { sectionId, lineIndex: 0 },
      content: "whole-line note",
    });
    return sectionId;
  }

  it("changing the text clears chordPlacements and ranged annotations on that line, but keeps whole-line annotations", () => {
    const sectionId = loadDraftWithLine();
    useSheetEditorStore.getState().setLineLyrics(sectionId, 0, "goodbye world");
    const draft = useSheetEditorStore.getState().draft!;
    expect(draft.sections[0].lines[0].lyrics).toBe("goodbye world");
    expect(draft.sections[0].lines[0].chordPlacements).toEqual([]);
    expect(draft.annotations).toHaveLength(1);
    expect(draft.annotations[0].type).toBe("note");
    expect(draft.annotations[0].target.range).toBeUndefined();
  });

  it("a no-op set with the same text clears nothing", () => {
    const sectionId = loadDraftWithLine();
    const before = useSheetEditorStore.getState().draft!;
    useSheetEditorStore.getState().setLineLyrics(sectionId, 0, "hello world");
    const after = useSheetEditorStore.getState().draft!;
    expect(after.sections[0].lines[0].chordPlacements).toEqual(before.sections[0].lines[0].chordPlacements);
    expect(after.annotations).toEqual(before.annotations);
    expect(after.sections[0].lines[0].chordPlacements).toHaveLength(1);
    expect(after.annotations).toHaveLength(2);
  });
});

describe("useSheetEditorStore.addAnnotation", () => {
  it("returns null and does not mutate draft when type is 'note' with empty/whitespace content", () => {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    const before = useSheetEditorStore.getState().draft!;
    const result1 = useSheetEditorStore.getState().addAnnotation({
      type: "note",
      target: { sectionId, lineIndex: 0 },
      content: "",
    });
    const result2 = useSheetEditorStore.getState().addAnnotation({
      type: "note",
      target: { sectionId, lineIndex: 0 },
      content: "   ",
    });
    expect(result1).toBeNull();
    expect(result2).toBeNull();
    expect(useSheetEditorStore.getState().draft).toEqual(before);
  });

  it("returns a fresh id and adds the annotation for valid content", () => {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    const id = useSheetEditorStore.getState().addAnnotation({
      type: "note",
      target: { sectionId, lineIndex: 0 },
      content: "hi",
    });
    expect(id).not.toBeNull();
    expect(useSheetEditorStore.getState().draft?.annotations).toEqual([
      { id, type: "note", target: { sectionId, lineIndex: 0 }, content: "hi" },
    ]);
  });

  it("does not require non-empty content for a highlight annotation", () => {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    const id = useSheetEditorStore.getState().addAnnotation({
      type: "highlight",
      target: { sectionId, lineIndex: 0, range: [0, 2] },
    });
    expect(id).not.toBeNull();
  });
});

describe("useSheetEditorStore.save", () => {
  it("creates a new sheet via useSheetsStore.addSheet when editingSheetId is null", () => {
    useSheetEditorStore.getState().load(null);
    useSheetEditorStore.getState().updateMeta({ title: "Brand New", bpm: 140 });
    const id = useSheetEditorStore.getState().save();
    expect(useSheetsStore.getState().getSheet(id)?.title).toBe("Brand New");
    expect(useSheetsStore.getState().getSheet(id)?.bpm).toBe(140);
  });

  it("updates the existing sheet via useSheetsStore.updateSheet when editing", () => {
    const id = useSheetsStore.getState().addSheet({ title: "Old Title", bpm: 100 });
    useSheetEditorStore.getState().load(id);
    useSheetEditorStore.getState().updateMeta({ title: "New Title" });
    const savedId = useSheetEditorStore.getState().save();
    expect(savedId).toBe(id);
    expect(useSheetsStore.getState().getSheet(id)?.title).toBe("New Title");
  });
});

describe("useSheetEditorStore.discard", () => {
  it("clears draft/editingSheetId/notFound and never touches useSheetsStore", () => {
    const id = useSheetsStore.getState().addSheet({ title: "Untouched", bpm: 100 });
    useSheetEditorStore.getState().load(id);
    useSheetEditorStore.getState().updateMeta({ title: "Changed In Draft Only" });
    useSheetEditorStore.getState().discard();
    const s = useSheetEditorStore.getState();
    expect(s.draft).toBeNull();
    expect(s.editingSheetId).toBeNull();
    expect(s.notFound).toBe(false);
    expect(useSheetsStore.getState().getSheet(id)?.title).toBe("Untouched");
  });
});

describe("useSheetEditorStore section/line/chord/override mutators", () => {
  it("addSection/updateSectionLabel/removeSection round-trip", () => {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    expect(useSheetEditorStore.getState().draft?.sections).toHaveLength(1);
    useSheetEditorStore.getState().updateSectionLabel(sectionId, "Chorus");
    expect(useSheetEditorStore.getState().draft?.sections[0].label).toBe("Chorus");
    useSheetEditorStore.getState().removeSection(sectionId);
    expect(useSheetEditorStore.getState().draft?.sections).toEqual([]);
  });

  it("addLine defaults to appending, and accepts an explicit index", () => {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    useSheetEditorStore.getState().addLine(sectionId); // append -> index 0
    useSheetEditorStore.getState().setLineLyrics(sectionId, 0, "first");
    useSheetEditorStore.getState().addLine(sectionId); // append -> index 1
    useSheetEditorStore.getState().setLineLyrics(sectionId, 1, "second");
    useSheetEditorStore.getState().addLine(sectionId, 1); // insert at 1
    useSheetEditorStore.getState().setLineLyrics(sectionId, 1, "inserted");
    expect(useSheetEditorStore.getState().draft?.sections[0].lines.map((l) => l.lyrics)).toEqual([
      "first",
      "inserted",
      "second",
    ]);
  });

  it("removeLine removes the line at the given index", () => {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    useSheetEditorStore.getState().addLine(sectionId);
    useSheetEditorStore.getState().setLineLyrics(sectionId, 0, "keep me");
    useSheetEditorStore.getState().addLine(sectionId);
    useSheetEditorStore.getState().setLineLyrics(sectionId, 1, "remove me");
    useSheetEditorStore.getState().removeLine(sectionId, 1);
    expect(useSheetEditorStore.getState().draft?.sections[0].lines.map((l) => l.lyrics)).toEqual(["keep me"]);
  });

  it("setChordPlacement upserts and removes by charIndex, keeping placements sorted", () => {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    useSheetEditorStore.getState().addLine(sectionId);
    useSheetEditorStore.getState().setLineLyrics(sectionId, 0, "abc def");
    useSheetEditorStore.getState().setChordPlacement(sectionId, 0, 4, "A");
    useSheetEditorStore.getState().setChordPlacement(sectionId, 0, 0, "E");
    expect(useSheetEditorStore.getState().draft?.sections[0].lines[0].chordPlacements).toEqual([
      { charIndex: 0, chordId: "E" },
      { charIndex: 4, chordId: "A" },
    ]);
    useSheetEditorStore.getState().setChordPlacement(sectionId, 0, 0, "D"); // upsert same index
    expect(useSheetEditorStore.getState().draft?.sections[0].lines[0].chordPlacements).toEqual([
      { charIndex: 0, chordId: "D" },
      { charIndex: 4, chordId: "A" },
    ]);
    useSheetEditorStore.getState().setChordPlacement(sectionId, 0, 0, null); // remove
    expect(useSheetEditorStore.getState().draft?.sections[0].lines[0].chordPlacements).toEqual([
      { charIndex: 4, chordId: "A" },
    ]);
  });

  it("setChordOverride upserts by chordId, removeChordOverride removes it", () => {
    useSheetEditorStore.getState().load(null);
    useSheetEditorStore.getState().setChordOverride("E5", ["0", "2", "2", "x", "x", "x"], ["E3", "B3"]);
    expect(useSheetEditorStore.getState().draft?.chordOverrides).toEqual([
      { chordId: "E5", guitarFrets: ["0", "2", "2", "x", "x", "x"], pianoKeys: ["E3", "B3"] },
    ]);
    useSheetEditorStore.getState().setChordOverride("E5", ["x", "x", "5", "5", "5", "3"], ["G3", "D4"]);
    expect(useSheetEditorStore.getState().draft?.chordOverrides).toEqual([
      { chordId: "E5", guitarFrets: ["x", "x", "5", "5", "5", "3"], pianoKeys: ["G3", "D4"] },
    ]);
    useSheetEditorStore.getState().removeChordOverride("E5");
    expect(useSheetEditorStore.getState().draft?.chordOverrides).toEqual([]);
  });

  it("updateAnnotation patches an existing annotation, removeAnnotation removes it", () => {
    useSheetEditorStore.getState().load(null);
    const sectionId = useSheetEditorStore.getState().addSection("Verse");
    const id = useSheetEditorStore.getState().addAnnotation({
      type: "note",
      target: { sectionId, lineIndex: 0 },
      content: "original",
    })!;
    useSheetEditorStore.getState().updateAnnotation(id, { content: "edited" });
    expect(useSheetEditorStore.getState().draft?.annotations[0].content).toBe("edited");
    useSheetEditorStore.getState().removeAnnotation(id);
    expect(useSheetEditorStore.getState().draft?.annotations).toEqual([]);
  });
});
