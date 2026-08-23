"use client";

import { buildLineSegments, Line, Sheet } from "@/lib/store";
import { resolveChordDisplay } from "@/lib/chords";

// Renders one Line as chord labels positioned above the lyrics they belong
// to (sheets-icd-v2.md §5.3), built on the shared `buildLineSegments`
// algorithm (§3.2). Per docs/DESIGN.md's explicit instruction, chord labels
// are absolutely positioned above their segment's first character — never
// faked with `&nbsp;`. Each segment's `chordId` is the *written* chord id
// (matches the chip row's convention, ICD §5.2) — `resolveChordDisplay` is
// only consulted here to know whether a chord resolves to something real,
// so an unrecognized chord can get a visibly different (dashed/muted)
// treatment instead of looking identical to a resolvable one.
interface ChordLyricLineProps {
  line: Line;
  highlightRanges: Array<[number, number]>;
  sheet: Pick<Sheet, "chordOverrides" | "capo" | "transposeSemitones">;
  onChordTap: (chordId: string) => void;
}

export function ChordLyricLine({ line, highlightRanges, sheet, onChordTap }: ChordLyricLineProps) {
  const segments = buildLineSegments(line, highlightRanges);

  if (segments.length === 0) {
    // Instrumental/blank line (buildLineSegments([]) for lyrics === "") —
    // still reserve the line's vertical rhythm.
    return <div className="min-h-[1.5em] pt-[18px]" aria-hidden="true" />;
  }

  return (
    <div className="relative flex flex-wrap pt-[18px] font-sans text-[15px] leading-[1.5]">
      {segments.map((segment) => {
        const resolved = segment.chordId ? resolveChordDisplay(segment.chordId, sheet) : null;
        const unknown = resolved?.resolvedFrom === "unknown";
        return (
          <span key={segment.charIndex} className="relative inline-block" style={{ whiteSpace: "pre" }}>
            {segment.chordId && (
              <button
                type="button"
                onClick={() => onChordTap(segment.chordId as string)}
                className={`font-mono-rf absolute bottom-full left-0 whitespace-nowrap text-[11px] font-bold tracking-[.02em] hover:bg-accent-100 active:bg-accent-200 ${
                  unknown ? "text-neutral-500 underline decoration-dashed underline-offset-2" : "text-accent-700"
                }`}
              >
                {segment.chordId}
              </button>
            )}
            <span
              className={
                segment.highlighted
                  ? "bg-accent-100 underline decoration-2 decoration-accent underline-offset-[6px]"
                  : undefined
              }
            >
              {segment.text}
            </span>
          </span>
        );
      })}
    </div>
  );
}
