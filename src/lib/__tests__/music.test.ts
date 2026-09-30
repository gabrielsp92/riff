import { describe, expect, it } from "vitest";
import { TUNINGS, formatSemitoneShift, transposeString, transposeTuning } from "../music";

const spell = (strings: { note: string; octave: number }[]) =>
  strings.map((s) => `${s.note}${s.octave}`).join(" ");

describe("transposeTuning", () => {
  it("drops standard tuning a semitone", () => {
    expect(spell(transposeTuning(TUNINGS["Standard E"], -1))).toBe("D#2 G#2 C#3 F#3 A#3 D#4");
  });

  it("raises standard tuning a semitone", () => {
    expect(spell(transposeTuning(TUNINGS["Standard E"], 1))).toBe("F2 A#2 D#3 G#3 C4 F4");
  });

  it("carries the octave across the C boundary", () => {
    expect(transposeString({ note: "C", octave: 3 }, -1)).toEqual({ note: "B", octave: 2 });
    expect(transposeString({ note: "B", octave: 3 }, 1)).toEqual({ note: "C", octave: 4 });
  });

  it("is a no-op at 0", () => {
    expect(transposeTuning(TUNINGS["Drop D"], 0)).toBe(TUNINGS["Drop D"]);
  });
});

describe("formatSemitoneShift", () => {
  it("labels shifts", () => {
    expect(formatSemitoneShift(0)).toBe("");
    expect(formatSemitoneShift(2)).toBe("+2 ST");
    expect(formatSemitoneShift(-1)).toBe("−1 ST");
  });
});
