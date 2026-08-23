"use client";

import { useState } from "react";
import { lookupChordShape } from "@/lib/chords";
import { NOTE_NAMES, NoteName } from "@/lib/music";
import { Section, useSheetEditorStore } from "@/lib/store";

// Chord voicing override editor (sheets-icd-v2.md §6.7, Assumption K).
// Lists the chord ids used in the draft; tapping one opens an editor
// pre-filled with the current effective shape (existing ChordOverride if
// present, else lookupChordShape's dictionary default) for all 6 guitar
// strings and the piano-key list.
//
// Every input here is a constrained picker, never freeform text — this is
// load-bearing, not cosmetic: `updateSheet`'s patch path (which `save()`
// goes through) does not itself validate ChordOverride shape the way
// `importFile` does, so this UI is the only thing standing between a
// malformed override and the store.
//
// Chord-id list is a local dedupe (not `uniqueChordIds` from chords.ts) —
// deliberately not taking a cross-branch/cross-epic dependency on that
// Epic-04-owned helper per this task's brief; it's a few lines either way.
// Standalone otherwise: no dependency on any sibling T5b-d/f component.

const FRET_OPTIONS = ["x", ...Array.from({ length: 25 }, (_, i) => String(i))]; // "x" or "0"-"24"
const OCTAVE_OPTIONS = Array.from({ length: 9 }, (_, i) => i); // 0-8
// Low-to-high display labels, matching the stored guitarFrets order
// (sheets-icd.md §2 / sheets-icd-v2.md §4.1 — this editor works in storage
// order; ChordDetail is what reverses it for high-to-low display).
const STRING_LABELS = ["E2", "A2", "D3", "G3", "B3", "E4"];

function localUniqueChordIds(sections: Section[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      for (const placement of line.chordPlacements) {
        if (!seen.has(placement.chordId)) {
          seen.add(placement.chordId);
          result.push(placement.chordId);
        }
      }
    }
  }
  return result;
}

interface PianoKeyRow {
  note: NoteName;
  octave: number;
}

function parsePianoKey(key: string): PianoKeyRow | null {
  const match = /^([A-G]#?)(\d+)$/.exec(key);
  if (!match) return null;
  const note = match[1];
  if (!(NOTE_NAMES as readonly string[]).includes(note)) return null;
  return { note: note as NoteName, octave: Number(match[2]) };
}

export function ChordOverrideEditor() {
  const sections = useSheetEditorStore((s) => s.draft?.sections ?? []);
  const overrides = useSheetEditorStore((s) => s.draft?.chordOverrides ?? []);
  const setChordOverride = useSheetEditorStore((s) => s.setChordOverride);
  const removeChordOverride = useSheetEditorStore((s) => s.removeChordOverride);

  const chordIds = localUniqueChordIds(sections);

  const [editingChordId, setEditingChordId] = useState<string | null>(null);
  const [frets, setFrets] = useState<string[]>(["x", "x", "x", "x", "x", "x"]);
  const [pianoRows, setPianoRows] = useState<PianoKeyRow[]>([]);

  const openEditor = (chordId: string) => {
    const existing = overrides.find((o) => o.chordId === chordId);
    if (existing) {
      setFrets(existing.guitarFrets);
      setPianoRows(existing.pianoKeys.map(parsePianoKey).filter((r): r is PianoKeyRow => r !== null));
    } else {
      const dict = lookupChordShape(chordId);
      setFrets(dict.guitarFrets ?? ["x", "x", "x", "x", "x", "x"]);
      setPianoRows((dict.pianoKeys ?? []).map(parsePianoKey).filter((r): r is PianoKeyRow => r !== null));
    }
    setEditingChordId(chordId);
  };

  const closeEditor = () => setEditingChordId(null);

  const handleConfirm = () => {
    if (!editingChordId) return;
    const pianoKeys = pianoRows.map((r) => `${r.note}${r.octave}`);
    setChordOverride(editingChordId, frets, pianoKeys);
    closeEditor();
  };

  const handleReset = () => {
    if (!editingChordId) return;
    removeChordOverride(editingChordId);
    closeEditor();
  };

  return (
    <div className="flex flex-col gap-3 border-b-2 border-ink p-[18px]">
      <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">CHORD OVERRIDES</div>

      {chordIds.length === 0 ? (
        <p className="font-mono-rf text-[11px] text-neutral-500">No chords placed yet.</p>
      ) : (
        <div className="flex flex-wrap gap-[6px]">
          {chordIds.map((chordId) => {
            const hasOverride = overrides.some((o) => o.chordId === chordId);
            return (
              <button
                key={chordId}
                onClick={() => openEditor(chordId)}
                className={`px-2 py-1 font-mono-rf text-[11px] font-bold tracking-[.04em] ${
                  hasOverride ? "bg-accent text-white" : "bg-neutral-200"
                }`}
              >
                {chordId}
              </button>
            );
          })}
        </div>
      )}

      {editingChordId && (
        <div className="flex flex-col gap-3 border-2 border-ink p-3">
          <div className="font-sans text-[13px] font-extrabold">{editingChordId}</div>

          <div>
            <div className="mb-1 font-mono-rf text-[10px] tracking-[.1em] text-neutral-600">
              GUITAR FRETS (LOW TO HIGH: {STRING_LABELS.join(" ")})
            </div>
            <div className="grid grid-cols-6 gap-1">
              {frets.map((fret, i) => (
                <select
                  key={i}
                  value={fret}
                  aria-label={`Fret for string ${STRING_LABELS[i]}`}
                  onChange={(e) => {
                    const next = [...frets];
                    next[i] = e.target.value;
                    setFrets(next);
                  }}
                  className="border-2 border-ink bg-transparent px-1 py-1 font-mono-rf text-[12px] text-ink"
                >
                  {FRET_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between font-mono-rf text-[10px] tracking-[.1em] text-neutral-600">
              <span>PIANO KEYS</span>
              <button
                onClick={() => setPianoRows([...pianoRows, { note: "C", octave: 4 }])}
                className="font-mono-rf text-[10px] font-bold text-accent"
              >
                + ADD KEY
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {pianoRows.length === 0 && (
                <p className="font-mono-rf text-[11px] text-neutral-500">No piano keys — add one above.</p>
              )}
              {pianoRows.map((row, i) => (
                <div key={i} className="flex items-center gap-1">
                  <select
                    value={row.note}
                    aria-label={`Note for piano key ${i + 1}`}
                    onChange={(e) => {
                      const next = [...pianoRows];
                      next[i] = { ...next[i], note: e.target.value as NoteName };
                      setPianoRows(next);
                    }}
                    className="border-2 border-ink bg-transparent px-1 py-1 font-mono-rf text-[12px] text-ink"
                  >
                    {NOTE_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <select
                    value={row.octave}
                    aria-label={`Octave for piano key ${i + 1}`}
                    onChange={(e) => {
                      const next = [...pianoRows];
                      next[i] = { ...next[i], octave: Number(e.target.value) };
                      setPianoRows(next);
                    }}
                    className="border-2 border-ink bg-transparent px-1 py-1 font-mono-rf text-[12px] text-ink"
                  >
                    {OCTAVE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setPianoRows(pianoRows.filter((_, idx) => idx !== i))}
                    className="font-mono-rf text-[10px] font-bold text-neutral-600 hover:text-accent"
                  >
                    REMOVE
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={closeEditor}
              className="font-mono-rf text-[10px] font-bold tracking-[.1em] text-neutral-600 hover:text-accent"
            >
              CANCEL
            </button>
            <div className="flex items-center gap-2">
              <button onClick={handleReset} className="font-mono-rf text-[10px] font-bold tracking-[.1em] text-accent">
                RESET TO DEFAULT
              </button>
              <button
                onClick={handleConfirm}
                className="bg-accent px-3 py-[6px] font-sans text-[11px] font-extrabold tracking-[.08em] text-white hover:bg-accent-600"
              >
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
