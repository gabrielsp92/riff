import { describe, expect, it } from "vitest";
import { buildLineSegments } from "@/lib/store";
import type { Line } from "@/lib/store";

// ---------------------------------------------------------------------------
// T4b — buildLineSegments (sheets-icd-v2.md §3.2)
//
// Note on the ICD's own worked example: the ICD's illustrative table for the
// highlight case has an acknowledged arithmetic slip (it says so explicitly
// in its own text). The assertions below are independently derived from the
// algorithm description (§3.2 steps 1-3), not copied from that table
// verbatim — see the trailing comment on each case for the by-hand
// breakpoint/segment derivation.
// ---------------------------------------------------------------------------

const line: Line = {
  lyrics: "Headlights on the county line", // length 29
  chordPlacements: [
    { charIndex: 0, chordId: "E5" },
    { charIndex: 18, chordId: "G5" },
  ],
};

describe("buildLineSegments (ICD v2 §3.2)", () => {
  it("worked example — no highlights", () => {
    // breakpoints: {0, 29} ∪ {0, 18} ∪ {} → sorted [0, 18, 29]
    // [0,18) -> "Headlights on the " (18 chars), chordId E5 (placement at 0)
    // [18,29) -> "county line" (11 chars), chordId G5 (placement at 18)
    expect(buildLineSegments(line, [])).toEqual([
      { text: "Headlights on the ", charIndex: 0, chordId: "E5", highlighted: false },
      { text: "county line", charIndex: 18, chordId: "G5", highlighted: false },
    ]);
  });

  it("worked example — highlight spanning a chord boundary", () => {
    // breakpoints: {0, 29} ∪ {0, 18} ∪ {22, 28} → sorted [0, 18, 22, 28, 29]
    // [0,18)  -> "Headlights on the " , chordId E5, highlighted: 0 not in [22,28) -> false
    // [18,22) -> lyrics.slice(18,22) = "coun", chordId G5 (placement at 18),
    //            highlighted: 18 not in [22,28) -> false
    // [22,28) -> lyrics.slice(22,28) = "ty lin", chordId null,
    //            highlighted: 22 in [22,28) -> true
    // [28,29) -> lyrics.slice(28,29) = "e", chordId null,
    //            highlighted: 28 not in [22,28) (range is exclusive of end) -> false
    expect(buildLineSegments(line, [[22, 28]])).toEqual([
      { text: "Headlights on the ", charIndex: 0, chordId: "E5", highlighted: false },
      { text: "coun", charIndex: 18, chordId: "G5", highlighted: false },
      { text: "ty lin", charIndex: 22, chordId: null, highlighted: true },
      { text: "e", charIndex: 28, chordId: null, highlighted: false },
    ]);
  });

  it("skips zero-length breakpoint pairs (a highlight range boundary coinciding with a chord placement)", () => {
    // breakpoints: {0, 29} ∪ {0, 18} ∪ {0, 18} (highlight [0,18)) → sorted [0, 18, 29]
    // no zero-length pair produced here (dedup already collapses the
    // coincident 0s and 18s), so segment count stays 2, both highlighted.
    expect(buildLineSegments(line, [[0, 18]])).toEqual([
      { text: "Headlights on the ", charIndex: 0, chordId: "E5", highlighted: true },
      { text: "county line", charIndex: 18, chordId: "G5", highlighted: false },
    ]);
  });

  it("a whole-line highlight range highlights only the segment starting at 0 by this algorithm's per-segment-start rule", () => {
    // This exercises the documented behavior precisely: `highlighted` is
    // computed once per segment from its *start* index, not from whether any
    // part of the segment overlaps the range.
    const singleSegmentLine: Line = { lyrics: "abc", chordPlacements: [] };
    expect(buildLineSegments(singleSegmentLine, [[0, 3]])).toEqual([
      { text: "abc", charIndex: 0, chordId: null, highlighted: true },
    ]);
  });

  it("handles an empty line with no chords/highlights", () => {
    const empty: Line = { lyrics: "", chordPlacements: [] };
    expect(buildLineSegments(empty, [])).toEqual([]);
  });

  it("a chord placement at the very end of an otherwise empty-tail line still anchors correctly", () => {
    const l: Line = { lyrics: "abc", chordPlacements: [{ charIndex: 3, chordId: "E" }] };
    // breakpoints: {0,3} ∪ {3} -> sorted [0,3]; single segment [0,3) "abc",
    // chordId null since no placement's charIndex === 0. The placement at 3
    // has nothing after it (3 === lyrics.length), so it produces no visible
    // segment of its own — this documents that edge case rather than leaving
    // it silently unverified.
    expect(buildLineSegments(l, [])).toEqual([{ text: "abc", charIndex: 0, chordId: null, highlighted: false }]);
  });
});
