"use client";

import { resolveChordDisplay } from "@/lib/chords";
import { NOTE_NAMES, NoteName, noteToMidi } from "@/lib/music";
import { Sheet } from "@/lib/store";

// Guitar string readout + piano voicing strip for a single written chord id
// (sheets-icd-v2.md §4). `guitarFrets`/`ResolvedChordDisplay.guitarFrets` are
// stored low-to-high ([E2,A2,D3,G3,B3,E4], matching music.ts's
// TUNINGS["Standard E"]) but a chord diagram must read high-to-low, top row
// first (e,B,G,D,A,E) — Assumption I, §4.1. This is the opposite of the
// Tuner's own string row, which stays in storage order — do not copy that
// pattern here.
const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

// Standard piano black-key pitch classes (C#, D#, F#, G#, A#), 0-indexed
// against music.ts's NOTE_NAMES (["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]).
const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

interface ChordDetailProps {
  writtenChordId: string;
  sheet: Pick<Sheet, "chordOverrides" | "capo" | "transposeSemitones">;
}

interface PianoCell {
  midi: number;
  label: string;
  isBlackKey: boolean;
  sounding: boolean;
}

function parsePianoKey(key: string): number | null {
  const match = /^([A-G]#?)(-?\d+)$/.exec(key);
  if (!match) return null;
  const [, note, octaveStr] = match;
  if (!(NOTE_NAMES as readonly string[]).includes(note)) return null;
  return noteToMidi(note as NoteName, Number(octaveStr));
}

// Schematic piano-voicing strip (sheets-icd-v2.md §4.3, Assumption N): every
// note in `pianoKeys` rendered distinctly, ascending pitch order, with a
// little chromatic padding on each side so the strip reads as a keyboard
// fragment rather than a bare stack of the exact notes. The precise
// cell-count/anchor-note math is a frontend-only implementation detail — no
// other module needs to agree on these numbers (unlike capo/transpose).
function buildPianoStrip(pianoKeys: string[]): PianoCell[] {
  const midis = pianoKeys.map(parsePianoKey).filter((m): m is number => m !== null);
  if (midis.length === 0) return [];
  const soundingSet = new Set(midis);

  const MIN_CELLS = 8;
  let low = Math.min(...midis) - 1;
  let high = Math.max(...midis) + 1;
  while (high - low + 1 < MIN_CELLS) {
    low -= 1;
    high += 1;
  }

  const cells: PianoCell[] = [];
  for (let midi = low; midi <= high; midi++) {
    const pitchClass = ((midi % 12) + 12) % 12;
    cells.push({
      midi,
      label: `${NOTE_NAMES[pitchClass]}${Math.floor(midi / 12) - 1}`,
      isBlackKey: BLACK_KEY_PITCH_CLASSES.has(pitchClass),
      sounding: soundingSet.has(midi),
    });
  }
  return cells;
}

export function ChordDetail({ writtenChordId, sheet }: ChordDetailProps) {
  const resolved = resolveChordDisplay(writtenChordId, sheet);

  if (resolved.resolvedFrom === "unknown") {
    // Existing repo convention for an undrawn/failed lookup (Placeholder.tsx
    // pattern) — mono-caption + 2px-ruled block, no tab/piano diagram
    // (ICD §4.2).
    return (
      <div className="flex flex-col items-center justify-center gap-3 border-2 border-divider p-6 text-center">
        <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">CHORD NOT RECOGNIZED</div>
        <div className="font-sans text-lg font-extrabold">{writtenChordId}</div>
      </div>
    );
  }

  const displayFrets = [...(resolved.guitarFrets ?? [])].reverse();
  const pianoCells = buildPianoStrip(resolved.pianoKeys ?? []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-sans text-lg font-extrabold">{writtenChordId}</span>
        <span className="font-mono-rf text-[10px] tracking-[.12em] text-neutral-600">
          {resolved.resolvedFrom === "override" ? "OVERRIDE" : "DICTIONARY"}
        </span>
      </div>

      <div>
        <div className="mb-1 font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">TABLATURE</div>
        <div className="font-mono-rf flex flex-col text-[13px] font-bold leading-[1.7]">
          {STRING_LABELS.map((label, i) => (
            <div key={label + i}>
              {label} |--{displayFrets[i] ?? "x"}--|
            </div>
          ))}
        </div>
      </div>

      {pianoCells.length > 0 && (
        <div>
          <div className="mb-1 font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">PIANO VOICING</div>
          <div className="flex h-[90px] border-2 border-ink">
            {pianoCells.map((cell, i) => (
              <div
                key={cell.midi}
                title={cell.label}
                className={`h-full flex-1 ${i > 0 ? "border-l-2 border-ink" : ""} ${
                  cell.sounding ? "bg-accent" : cell.isBlackKey ? "bg-ink" : "bg-bg"
                }`}
              />
            ))}
          </div>
          <div className="mt-1 font-mono-rf text-[10px] text-neutral-700">
            {(resolved.pianoKeys ?? []).join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}
