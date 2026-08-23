"use client";

import { useMemo, useState } from "react";
import { KNOWN_CHORD_IDS } from "@/lib/chords";

// Shared chord-id picker (sheets-icd-v2.md §6.4). A text input with
// autocomplete suggestions drawn from KNOWN_CHORD_IDS, filtered
// case-insensitively as the user types, but confirming always accepts
// whatever arbitrary text is currently typed — even if it matches no known
// chord. An unrecognized id is stored as-is and simply resolves to
// "unknown" at render time (resolveChordDisplay) — not this component's
// concern to reject or warn about.
export interface ChordPickerProps {
  initialValue: string; // "" if no chord currently placed at this position
  onConfirm: (chordId: string) => void;
  onRemove?: () => void; // omit to hide the "remove" action (e.g. no existing placement to clear)
  onCancel: () => void;
}

export function ChordPicker({ initialValue, onConfirm, onRemove, onCancel }: ChordPickerProps) {
  const [text, setText] = useState(initialValue);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    const pool = q === "" ? KNOWN_CHORD_IDS : KNOWN_CHORD_IDS.filter((id) => id.toLowerCase().includes(q));
    return pool.slice(0, 8);
  }, [text]);

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    onConfirm(trimmed);
  };

  return (
    <div className="flex flex-col gap-2 border-2 border-ink bg-surface p-3">
      <input
        type="text"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleConfirm();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Chord (e.g. E5, Am, D7) — or type anything"
        aria-label="Chord id"
        className="w-full border-2 border-ink bg-transparent px-2 py-2 font-mono-rf text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent"
      />

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-[6px]">
          {suggestions.map((id) => (
            <button
              key={id}
              onClick={() => onConfirm(id)}
              className="bg-neutral-200 px-2 py-1 font-mono-rf text-[11px] font-bold tracking-[.04em] hover:bg-accent-100"
            >
              {id}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onCancel}
          className="font-mono-rf text-[10px] font-bold tracking-[.1em] text-neutral-600 hover:text-accent"
        >
          CANCEL
        </button>
        <div className="flex items-center gap-2">
          {onRemove && (
            <button
              onClick={onRemove}
              className="font-mono-rf text-[10px] font-bold tracking-[.1em] text-accent"
            >
              REMOVE CHORD
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={text.trim() === ""}
            className="bg-accent px-3 py-[6px] font-sans text-[11px] font-extrabold tracking-[.08em] text-white hover:bg-accent-600 disabled:opacity-40"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
