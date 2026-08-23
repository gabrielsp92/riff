import { describe, expect, it } from "vitest";
import {
  applyCapo,
  lookupChordShape,
  resolveChordDisplay,
  transposeChordId,
  uniqueChordIds,
} from "@/lib/chords";
import { Sheet } from "@/lib/store";

// ---------------------------------------------------------------------------
// T2a — lookupChordShape (sheets-icd.md §4.2)
// ---------------------------------------------------------------------------

describe("lookupChordShape — fixed dictionary values (ICD §4.2)", () => {
  it.each([
    ["E5", ["0", "2", "2", "x", "x", "x"], ["E3", "B3"]],
    ["G5", ["3", "5", "5", "x", "x", "x"], ["G3", "D4"]],
    ["A5", ["x", "0", "2", "2", "x", "x"], ["A3", "E4"]],
    ["D5", ["x", "5", "7", "7", "x", "x"], ["D3", "A3"]],
    ["C", ["x", "3", "2", "0", "1", "0"], ["C3", "E3", "G3"]],
    ["D", ["x", "x", "0", "2", "3", "2"], ["D3", "F#3", "A3"]],
    ["E", ["0", "2", "2", "1", "0", "0"], ["E3", "G#3", "B3"]],
    ["G", ["3", "2", "0", "0", "0", "3"], ["G3", "B3", "D4"]],
    ["A", ["x", "0", "2", "2", "2", "0"], ["A3", "C#4", "E4"]],
    ["Am", ["x", "0", "2", "2", "1", "0"], ["A3", "C4", "E4"]],
    ["Dm", ["x", "x", "0", "2", "3", "1"], ["D3", "F3", "A3"]],
    ["Em", ["0", "2", "2", "0", "0", "0"], ["E3", "G3", "B3"]],
    ["E7", ["0", "2", "0", "1", "0", "0"], ["E3", "G#3", "B3", "D4"]],
    ["A7", ["x", "0", "2", "0", "2", "0"], ["A3", "C#4", "E4", "G4"]],
    ["D7", ["x", "x", "0", "2", "1", "2"], ["D3", "F#3", "A3", "C4"]],
    ["G7", ["3", "2", "0", "0", "0", "1"], ["G3", "B3", "D4", "F4"]],
  ])("%s", (chordId, guitarFrets, pianoKeys) => {
    expect(lookupChordShape(chordId)).toEqual({ guitarFrets, pianoKeys, source: "dictionary" });
  });

  it("is case-insensitive after trim", () => {
    expect(lookupChordShape("  am  ")).toEqual(lookupChordShape("Am"));
    expect(lookupChordShape("E5")).toEqual(lookupChordShape("e5"));
    expect(lookupChordShape("G7")).toEqual(lookupChordShape(" g7 "));
  });

  it("returns the explicit 'unknown' shape for unrecognized chords, never throwing or guessing", () => {
    for (const bad of ["F#5", "Bm7", "Cmaj9", "", "   ", "not a chord", "Zz9"]) {
      expect(() => lookupChordShape(bad)).not.toThrow();
      expect(lookupChordShape(bad)).toEqual({ guitarFrets: null, pianoKeys: null, source: "unknown" });
    }
  });

  it("returns fresh arrays, not shared references, on repeated lookups", () => {
    const a = lookupChordShape("E5");
    const b = lookupChordShape("E5");
    expect(a.guitarFrets).not.toBe(b.guitarFrets);
    expect(a.guitarFrets).toEqual(b.guitarFrets);
  });
});

// ---------------------------------------------------------------------------
// T2b — applyCapo / transposeChordId (sheets-icd.md §4.4, §4.6)
// ---------------------------------------------------------------------------

describe("applyCapo (ICD §4.4)", () => {
  it("fixed worked example: open G major shape with capo 2", () => {
    expect(applyCapo(["3", "2", "0", "0", "0", "3"], 2)).toEqual(["5", "4", "2", "2", "2", "5"]);
  });

  it("leaves muted strings ('x') untouched", () => {
    expect(applyCapo(["x", "0", "2", "2", "x", "x"], 3)).toEqual(["x", "3", "5", "5", "x", "x"]);
  });

  it("is a no-op at capo 0", () => {
    expect(applyCapo(["0", "2", "2", "x", "x", "x"], 0)).toEqual(["0", "2", "2", "x", "x", "x"]);
  });
});

describe("transposeChordId (ICD §4.4, §4.6)", () => {
  it("fixed worked example: E5 up 2 semitones is F#5", () => {
    expect(transposeChordId("E5", 2)).toBe("F#5");
  });

  it("shifts a bare major root", () => {
    expect(transposeChordId("C", 2)).toBe("D");
  });

  it("preserves suffix untouched while shifting the root", () => {
    expect(transposeChordId("Am", 3)).toBe("Cm");
    expect(transposeChordId("Dmaj7", 1)).toBe("D#maj7");
  });

  it("wraps around the octave in both directions", () => {
    expect(transposeChordId("B", 1)).toBe("C");
    expect(transposeChordId("C", -1)).toBe("B");
  });

  it("shifts both root and bass in a slash chord", () => {
    expect(transposeChordId("D/F#", 2)).toBe("E/G#");
  });

  it("always respells sharp-only, even at semitones: 0 (Assumption D)", () => {
    expect(transposeChordId("Bb", 0)).toBe("A#");
    expect(transposeChordId("Eb7", 0)).toBe("D#7");
  });

  it("returns unparseable input unchanged rather than throwing", () => {
    expect(transposeChordId("H7", 2)).toBe("H7");
    expect(transposeChordId("", 2)).toBe("");
    expect(() => transposeChordId("nonsense", 5)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T2c — resolveChordDisplay (sheets-icd.md §4.3, sample payloads §5.2–§5.4)
// ---------------------------------------------------------------------------

describe("resolveChordDisplay — ICD §5.2–§5.4 sample payloads", () => {
  it("§5.2 — dictionary hit", () => {
    expect(resolveChordDisplay("G5", { chordOverrides: [], capo: 0, transposeSemitones: 0 })).toEqual({
      writtenChordId: "G5",
      lookupChordId: "G5",
      guitarFrets: ["3", "5", "5", "x", "x", "x"],
      pianoKeys: ["G3", "D4"],
      resolvedFrom: "dictionary",
    });
  });

  it("§5.3 — override wins, with capo", () => {
    const sheet = {
      chordOverrides: [{ chordId: "G5", guitarFrets: ["x", "x", "5", "5", "5", "3"], pianoKeys: ["G3", "D4"] }],
      capo: 2,
      transposeSemitones: 0,
    };
    expect(resolveChordDisplay("G5", sheet)).toEqual({
      writtenChordId: "G5",
      lookupChordId: "G5",
      guitarFrets: ["x", "x", "7", "7", "7", "5"],
      pianoKeys: ["G3", "D4"],
      resolvedFrom: "override",
    });
  });

  it("§5.4 — unknown chord (fallback)", () => {
    expect(resolveChordDisplay("Cmaj9", { chordOverrides: [], capo: 0, transposeSemitones: 0 })).toEqual({
      writtenChordId: "Cmaj9",
      lookupChordId: "Cmaj9",
      guitarFrets: null,
      pianoKeys: null,
      resolvedFrom: "unknown",
    });
  });
});

describe("resolveChordDisplay — additional composition rules", () => {
  it("transpose changes the dictionary id looked up, with capo applied after", () => {
    // E5 + 2 semitones -> F#5, which isn't in the fixed dictionary, so this
    // exercises the "transposed into an unknown chord" path cleanly.
    const result = resolveChordDisplay("E5", { chordOverrides: [], capo: 1, transposeSemitones: 2 });
    expect(result.lookupChordId).toBe("F#5");
    expect(result.resolvedFrom).toBe("unknown");
  });

  it("transpose lands on a dictionary entry and capo applies on top of it", () => {
    // G5 - 2 semitones -> F5 (unknown) is a bad example; use a mapped pair
    // that stays inside the fixed dictionary: A5 -2 -> G5.
    const result = resolveChordDisplay("A5", { chordOverrides: [], capo: 1, transposeSemitones: -2 });
    expect(result.lookupChordId).toBe("G5");
    expect(result.resolvedFrom).toBe("dictionary");
    expect(result.guitarFrets).toEqual(applyCapo(["3", "5", "5", "x", "x", "x"], 1));
    expect(result.pianoKeys).toEqual(["G3", "D4"]);
  });

  it("override resolution ignores transposeSemitones entirely", () => {
    const sheet = {
      chordOverrides: [{ chordId: "E5", guitarFrets: ["0", "2", "2", "x", "x", "x"], pianoKeys: ["E3", "B3"] }],
      capo: 0,
      transposeSemitones: 7, // large transpose — must have zero effect on an override
    };
    const result = resolveChordDisplay("E5", sheet);
    expect(result.lookupChordId).toBe("E5");
    expect(result.guitarFrets).toEqual(["0", "2", "2", "x", "x", "x"]);
    expect(result.resolvedFrom).toBe("override");
  });

  it("never throws on garbage chord names", () => {
    for (const bad of ["", "???", "12345", "Xyz#b7/Q"]) {
      expect(() =>
        resolveChordDisplay(bad, { chordOverrides: [], capo: 0, transposeSemitones: 0 })
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// T4b — uniqueChordIds (sheets-icd-v2.md §3.1)
// ---------------------------------------------------------------------------

describe("uniqueChordIds (ICD v2 §3.1)", () => {
  const sheetDeadAir: Pick<Sheet, "sections"> = {
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
          {
            lyrics: "Amp hum keeping perfect time",
            chordPlacements: [
              { charIndex: 0, chordId: "A5" },
              { charIndex: 16, chordId: "D5" },
            ],
          },
        ],
      },
      {
        id: "sec-chorus-1",
        label: "Chorus",
        lines: [
          {
            lyrics: "Dead air, dead air on the dial",
            chordPlacements: [
              { charIndex: 0, chordId: "D5" },
              { charIndex: 26, chordId: "A5" },
            ],
          },
          {
            lyrics: "Nothing on for a hundred mile",
            chordPlacements: [
              { charIndex: 0, chordId: "E5" },
              { charIndex: 17, chordId: "G5" },
            ],
          },
        ],
      },
    ],
  };

  it("worked example — DEAD AIR ON THE HIGHWAY seed sheet", () => {
    expect(uniqueChordIds(sheetDeadAir)).toEqual(["E5", "G5", "A5", "D5"]);
  });

  it("returns [] for a sheet with no sections", () => {
    expect(uniqueChordIds({ sections: [] })).toEqual([]);
  });

  it("returns [] for sections whose lines have no chord placements", () => {
    expect(
      uniqueChordIds({
        sections: [{ id: "s1", label: "Verse", lines: [{ lyrics: "no chords here", chordPlacements: [] }] }],
      })
    ).toEqual([]);
  });

  it("dedupes a chord id reappearing later without reordering it", () => {
    expect(
      uniqueChordIds({
        sections: [
          {
            id: "s1",
            label: "Verse",
            lines: [
              {
                lyrics: "ab",
                chordPlacements: [
                  { charIndex: 0, chordId: "E5" },
                  { charIndex: 1, chordId: "A5" },
                ],
              },
              { lyrics: "cd", chordPlacements: [{ charIndex: 0, chordId: "E5" }] },
            ],
          },
        ],
      })
    ).toEqual(["E5", "A5"]);
  });
});
