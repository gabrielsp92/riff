"use client";

import { MAX_SEMITONE_SHIFT } from "@/lib/music";

/**
 * −/+ stepper that raises or drops every string of the selected tuning by a
 * semitone. Clicking the value resets it to 0.
 */
export function TransposeControl({
  semitoneShift,
  shiftLabel,
  onShift,
  onReset,
  compact = false,
}: {
  semitoneShift: number;
  shiftLabel: string;
  onShift: (delta: number) => void;
  onReset: () => void;
  compact?: boolean;
}) {
  const btn = `flex items-center justify-center bg-neutral-200 font-sans font-extrabold leading-none hover:bg-accent-100 active:bg-accent-200 disabled:opacity-40 disabled:hover:bg-neutral-200 ${
    compact ? "h-8 w-10 text-[16px]" : "h-9 w-11 text-[18px]"
  }`;

  return (
    <div className="flex items-center gap-[2px]">
      <button
        type="button"
        aria-label="Lower tuning one semitone"
        disabled={semitoneShift <= -MAX_SEMITONE_SHIFT}
        onClick={() => onShift(-1)}
        className={btn}
      >
        −
      </button>
      <button
        type="button"
        aria-label="Reset transpose"
        title="Reset to 0"
        onClick={onReset}
        className={`flex flex-1 items-center justify-center font-mono-rf font-bold tracking-[.1em] ${
          compact ? "h-8 text-[10px]" : "h-9 text-[11px]"
        } ${semitoneShift === 0 ? "bg-neutral-200 text-neutral-700" : "bg-accent text-white"}`}
      >
        {shiftLabel || "0 ST"}
      </button>
      <button
        type="button"
        aria-label="Raise tuning one semitone"
        disabled={semitoneShift >= MAX_SEMITONE_SHIFT}
        onClick={() => onShift(1)}
        className={btn}
      >
        +
      </button>
    </div>
  );
}
