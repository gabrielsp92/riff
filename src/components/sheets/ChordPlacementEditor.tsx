"use client";

import { useEffect, useState } from "react";
import { tokenizeWords, useSheetEditorStore, WordToken } from "@/lib/store";
import { ChordPicker } from "./ChordPicker";

// Per-line chord-placement editor (sheets-icd-v2.md §6.3, Assumption G).
// Two modes, switched by the user per line (not globally):
//   1. Text mode: a plain textarea bound to the line's lyrics, committing to
//      `setLineLyrics` on blur/Enter.
//   2. Placement mode: the line rendered as tappable word tokens via
//      `tokenizeWords` — tapping one opens ChordPicker pre-filled with the
//      chord at that exact charIndex if any; confirming/removing calls
//      `setChordPlacement`.
// Standalone: identifies its line via `sectionId`/`lineIndex` props and reads
// everything else from `useSheetEditorStore` directly — no dependency on
// SectionEditor or any sibling T5c/e/f component. Ships with a simple inline
// preview (chip-before-word) rather than ChordLyricLine, which doesn't exist
// on any branch yet (confirmed via `git log --all`) — per sheets-icd-v2.md
// §7, that's an explicitly non-blocking, later swap-in.
export interface ChordPlacementEditorProps {
  sectionId: string;
  lineIndex: number;
  // Optional hook for the "Highlight this chord" shortcut (sheets-icd-v2.md
  // §6.8, Assumption L) — a future wiring pass can supply a callback (e.g.
  // one built from AnnotationEditor.tsx's exported
  // `computeChordHighlightRange` + `addAnnotation`) to make a
  // "HIGHLIGHT THIS CHORD" button appear in the picker for any tapped word
  // that currently has a chord placed on it. Left unwired here deliberately
  // — see this component's file-independence note above.
  onHighlightChord?: (sectionId: string, lineIndex: number, charIndex: number) => void;
}

export function ChordPlacementEditor({ sectionId, lineIndex, onHighlightChord }: ChordPlacementEditorProps) {
  const line = useSheetEditorStore(
    (s) => s.draft?.sections.find((sec) => sec.id === sectionId)?.lines[lineIndex]
  );
  const setLineLyrics = useSheetEditorStore((s) => s.setLineLyrics);
  const setChordPlacement = useSheetEditorStore((s) => s.setChordPlacement);

  const [mode, setMode] = useState<"text" | "placement">("text");
  const [lyricsDraft, setLyricsDraft] = useState(line?.lyrics ?? "");
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);

  // Resync the local textarea draft when this instance starts representing
  // a different line (identity change) — not on every store update, so
  // mid-edit keystrokes are never clobbered by our own eventual commit.
  useEffect(() => {
    setLyricsDraft(line?.lyrics ?? "");
    setActiveCharIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, lineIndex]);

  if (!line) return null;

  const commitLyrics = () => {
    if (lyricsDraft !== line.lyrics) setLineLyrics(sectionId, lineIndex, lyricsDraft);
  };

  const tokens: WordToken[] = tokenizeWords(line.lyrics);
  const activePlacement =
    activeCharIndex === null ? null : line.chordPlacements.find((cp) => cp.charIndex === activeCharIndex) ?? null;

  return (
    <div className="flex flex-col gap-2 border-2 border-divider p-2">
      <div className="flex gap-[2px]">
        <button
          onClick={() => setMode("text")}
          className={`px-2 py-1 font-mono-rf text-[10px] font-bold tracking-[.08em] ${
            mode === "text" ? "bg-accent text-white" : "bg-neutral-200"
          }`}
        >
          TEXT
        </button>
        <button
          onClick={() => setMode("placement")}
          className={`px-2 py-1 font-mono-rf text-[10px] font-bold tracking-[.08em] ${
            mode === "placement" ? "bg-accent text-white" : "bg-neutral-200"
          }`}
        >
          PLACE CHORDS
        </button>
      </div>

      {mode === "text" ? (
        <textarea
          value={lyricsDraft}
          onChange={(e) => setLyricsDraft(e.target.value)}
          onBlur={commitLyrics}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitLyrics();
            }
          }}
          rows={2}
          placeholder="Line lyrics (blank = instrumental)"
          aria-label="Line lyrics"
          className="w-full resize-none border-2 border-ink bg-transparent px-2 py-2 font-mono-rf text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent"
        />
      ) : tokens.length === 0 ? (
        <p className="font-mono-rf text-[11px] text-neutral-500">Line is empty — switch to TEXT mode to add lyrics.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-x-1 gap-y-2">
          {tokens.map((token) => {
            const placement = line.chordPlacements.find((cp) => cp.charIndex === token.charIndex);
            return (
              <button
                key={token.charIndex}
                onClick={() => setActiveCharIndex(token.charIndex)}
                className="flex flex-col items-start border-b-2 border-transparent px-1 py-1 hover:border-accent"
              >
                {placement && <span className="font-mono-rf text-[10px] font-bold text-accent">{placement.chordId}</span>}
                <span className="font-mono-rf text-[13px] text-ink">{token.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {activeCharIndex !== null && (
        <div className="mt-1 flex flex-col gap-2">
          <ChordPicker
            initialValue={activePlacement?.chordId ?? ""}
            onConfirm={(chordId) => {
              setChordPlacement(sectionId, lineIndex, activeCharIndex, chordId);
              setActiveCharIndex(null);
            }}
            onRemove={
              activePlacement
                ? () => {
                    setChordPlacement(sectionId, lineIndex, activeCharIndex, null);
                    setActiveCharIndex(null);
                  }
                : undefined
            }
            onCancel={() => setActiveCharIndex(null)}
          />
          {onHighlightChord && activePlacement && (
            <button
              onClick={() => {
                onHighlightChord(sectionId, lineIndex, activeCharIndex);
                setActiveCharIndex(null);
              }}
              className="w-full border-2 border-ink bg-neutral-200 px-3 py-2 font-mono-rf text-[10px] font-bold tracking-[.08em] hover:bg-accent-100"
            >
              HIGHLIGHT THIS CHORD
            </button>
          )}
        </div>
      )}
    </div>
  );
}
