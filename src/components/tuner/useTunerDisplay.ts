"use client";

import { useTunerStore } from "@/lib/store";
import {
  TUNINGS,
  formatSemitoneShift,
  midiToFreq,
  nearestStringIndex,
  transposeTuning,
} from "@/lib/music";

export function useTunerDisplay() {
  const tuning = useTunerStore((s) => s.tuning);
  const setTuning = useTunerStore((s) => s.setTuning);
  const semitoneShift = useTunerStore((s) => s.semitoneShift);
  const shiftSemitones = useTunerStore((s) => s.shiftSemitones);
  const resetSemitoneShift = useTunerStore((s) => s.resetSemitoneShift);
  const a4 = useTunerStore((s) => s.a4);
  const detected = useTunerStore((s) => s.detected);
  const micLevel = useTunerStore((s) => s.micLevel);
  const bars = useTunerStore((s) => s.bars);
  const permission = useTunerStore((s) => s.permission);

  const strings = transposeTuning(TUNINGS[tuning], semitoneShift);
  const shiftLabel = formatSemitoneShift(semitoneShift);
  // e.g. "STANDARD E −1 ST" — used in headers so the shift is always visible.
  const tuningLabel = `${tuning.toUpperCase()}${shiftLabel ? ` ${shiftLabel}` : ""}`;
  const cents = detected?.cents ?? 0;
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const percent = ((clampedCents + 50) / 100) * 100;
  const inTune = detected !== null && Math.abs(cents) <= 5;

  const activeStringIndex = detected
    ? nearestStringIndex(midiToFreq(detected.midi + detected.cents / 100, a4), strings, a4)
    : null;

  const ticks = Array.from({ length: 21 }, (_, i) => ({
    key: i,
    height: i === 10 ? 30 : i % 5 === 0 ? 20 : 11,
  }));

  return {
    tuning,
    setTuning,
    semitoneShift,
    shiftSemitones,
    resetSemitoneShift,
    shiftLabel,
    tuningLabel,
    strings,
    a4,
    detected,
    micLevel,
    bars,
    permission,
    cents: clampedCents,
    percent,
    inTune,
    activeStringIndex,
    ticks,
  };
}
