export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

export type TuningName = "Standard E" | "Drop D" | "Open G";

export const TUNING_NAMES: TuningName[] = ["Standard E", "Drop D", "Open G"];

export interface StringSpec {
  note: NoteName;
  octave: number;
}

export const TUNINGS: Record<TuningName, StringSpec[]> = {
  // Low string (6) to high string (1), matching the on-screen left-to-right order.
  "Standard E": [
    { note: "E", octave: 2 },
    { note: "A", octave: 2 },
    { note: "D", octave: 3 },
    { note: "G", octave: 3 },
    { note: "B", octave: 3 },
    { note: "E", octave: 4 },
  ],
  "Drop D": [
    { note: "D", octave: 2 },
    { note: "A", octave: 2 },
    { note: "D", octave: 3 },
    { note: "G", octave: 3 },
    { note: "B", octave: 3 },
    { note: "E", octave: 4 },
  ],
  "Open G": [
    { note: "D", octave: 2 },
    { note: "G", octave: 2 },
    { note: "D", octave: 3 },
    { note: "G", octave: 3 },
    { note: "B", octave: 3 },
    { note: "D", octave: 4 },
  ],
};

export function noteToMidi(note: NoteName, octave: number): number {
  return (octave + 1) * 12 + NOTE_NAMES.indexOf(note);
}

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export function stringFreq(s: StringSpec, a4 = 440): number {
  return midiToFreq(noteToMidi(s.note, s.octave), a4);
}

export interface DetectedNote {
  name: NoteName;
  octave: number;
  cents: number;
  midi: number;
}

/** Nearest chromatic note to a frequency, with signed cents deviation (-50..+50). */
export function noteFromFrequency(freq: number, a4 = 440): DetectedNote {
  const midi = freqToMidi(freq, a4);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return { name, octave, cents, midi: rounded };
}

/** Index (0..5, low to high) of the string whose target pitch is closest to freq. */
export function nearestStringIndex(freq: number, tuning: StringSpec[], a4 = 440): number {
  let best = 0;
  let bestDist = Infinity;
  tuning.forEach((s, i) => {
    const dist = Math.abs(Math.log2(freq / stringFreq(s, a4)));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}
