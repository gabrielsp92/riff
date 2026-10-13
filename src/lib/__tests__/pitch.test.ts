import { describe, expect, it } from "vitest";
import { autoCorrelate } from "../pitch";
import { TUNINGS, stringFreq } from "../music";

const SAMPLE_RATE = 48000;
const SIZE = 2048;

/** Deterministic pseudo-random noise in -0.5..0.5 (Park–Miller). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  };
}

/** Plucked-string-ish signal: fundamental plus decaying harmonics, with a little noise. */
function pluck(freq: number, amp: number, noise = 0.002, seed = 7919): Float32Array {
  const rand = rng(seed);
  const harmonics = [1, 0.5, 0.33, 0.25, 0.2, 0.15];
  const phases = harmonics.map(() => rand() * 2 * Math.PI);
  const buf = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    let v = 0;
    harmonics.forEach((h, k) => {
      v += h * Math.sin((2 * Math.PI * freq * (k + 1) * i) / SAMPLE_RATE + phases[k]);
    });
    buf[i] = amp * v + noise * rand();
  }
  return buf;
}

const cents = (detected: number, target: number) => 1200 * Math.log2(detected / target);

describe("autoCorrelate", () => {
  it.each(TUNINGS["Standard E"].map((s) => [`${s.note}${s.octave}`, stringFreq(s)]))(
    "detects %s at normal volume",
    (_, freq) => {
      const detected = autoCorrelate(pluck(freq, 0.1), SAMPLE_RATE);
      expect(Math.abs(cents(detected, freq))).toBeLessThan(10);
    },
  );

  it("detects a quietly plucked high E (E4)", () => {
    const e4 = stringFreq({ note: "E", octave: 4 });
    for (const seed of [1, 2, 3, 4, 5]) {
      const detected = autoCorrelate(pluck(e4, 0.006, 0.002, seed * 7919), SAMPLE_RATE);
      expect(Math.abs(cents(detected, e4))).toBeLessThan(10);
    }
  });

  it("returns -1 for silence", () => {
    expect(autoCorrelate(new Float32Array(SIZE), SAMPLE_RATE)).toBe(-1);
  });

  it("returns -1 for noise with no clear pitch", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rand = rng(seed * 31);
      const buf = Float32Array.from({ length: SIZE }, () => 0.06 * rand());
      expect(autoCorrelate(buf, SAMPLE_RATE)).toBe(-1);
    }
  });
});
