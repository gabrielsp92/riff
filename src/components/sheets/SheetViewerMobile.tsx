"use client";

import { useMemo, useRef, useState } from "react";
import { uniqueChordIds } from "@/lib/chords";
import { useSheetsNavStore, useSheetsStore } from "@/lib/store";
import { AUTOSCROLL_SPEEDS, useAutoscroll } from "@/hooks/useAutoscroll";
import { ChordDetail } from "./ChordDetail";
import { ChordLyricLine } from "./ChordLyricLine";
import {
  highlightRangesForLine,
  noteAnnotationsForLine,
  scrollToSection,
  sendToMetronome,
  useCurrentSectionLabel,
} from "./sheetsViewerHelpers";

// Sheet viewer, mobile layout (sheets-icd-v2.md §5). Covers every state in
// §5.8's coverage-check matrix: loading (!hydrated), not found (hydrated &&
// !getSheet), empty (sections.length === 0), populated, and a persistence-
// degraded banner layered over any of the above. The "← SHEETS" back
// control lives one level up in SheetsMobile.tsx — this component doesn't
// render a second one.
export function SheetViewerMobile({ sheetId }: { sheetId: string }) {
  const hydrated = useSheetsStore((s) => s.hydrated);
  const persistenceError = useSheetsStore((s) => s.persistenceError);
  const sheet = useSheetsStore((s) => s.getSheet(sheetId));
  const openList = useSheetsNavStore((s) => s.openList);
  const openEditor = useSheetsNavStore((s) => s.openEditor);
  const openViewer = useSheetsNavStore((s) => s.openViewer);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [activeChordId, setActiveChordId] = useState<string | null>(null);
  const autoscroll = useAutoscroll(bodyRef);
  const currentSectionLabel = useCurrentSectionLabel(bodyRef, sheet?.sections ?? []);

  const chordIds = useMemo(() => (sheet ? uniqueChordIds(sheet) : []), [sheet]);

  // Delete/duplicate (sheets-icd-v2.md §6.9, Assumption P). Delete is guarded
  // by a plain window.confirm — no new modal dependency, matching this
  // codebase's zero-modal-library footprint. Duplicate is non-destructive and
  // needs no confirmation; it lands the user directly on the fresh copy.
  const handleDelete = () => {
    if (!window.confirm(`Delete "${sheet?.title ?? "this sheet"}"? This can't be undone.`)) return;
    useSheetsStore.getState().removeSheet(sheetId);
    openList();
  };

  const handleDuplicate = () => {
    const newId = useSheetsStore.getState().duplicateSheet(sheetId);
    if (newId) openViewer(newId);
  };

  const persistenceBanner = persistenceError && (
    <div className="border-b-2 border-divider bg-neutral-200 px-[18px] py-2 font-mono-rf text-[10px] tracking-[.1em] text-neutral-700">
      {persistenceError}
    </div>
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {persistenceBanner}
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">LOADING…</div>
          <p className="max-w-[260px] text-sm text-neutral-700">Loading this sheet.</p>
        </div>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {persistenceBanner}
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">SHEET NOT FOUND</div>
          <p className="max-w-[260px] text-sm text-neutral-700">
            This sheet may have been deleted or the link is stale.
          </p>
          <button
            onClick={openList}
            className="bg-accent px-4 py-3 font-sans text-xs font-extrabold tracking-[.1em] text-white hover:bg-accent-600 active:bg-accent-700"
          >
            ← SHEETS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {persistenceBanner}

      <div className="border-b-2 border-ink px-[18px] py-4">
        <div className="font-sans text-[26px] font-extrabold leading-[1.05] tracking-[-.02em]">{sheet.title}</div>
        <div className="mt-1 font-mono-rf text-[10px] tracking-[.12em] text-neutral-700">
          KEY OF {sheet.key ?? "—"} · {sheet.bpm} BPM · {sheet.timeSignature.beats}/{sheet.timeSignature.unit}
          {currentSectionLabel ? ` · ${currentSectionLabel.toUpperCase()}` : ""}
        </div>
        <div className="mt-2 flex gap-[6px]">
          <span className="font-mono-rf bg-neutral-200 px-2 py-1 text-[10px] font-bold tracking-[.08em]">
            CAPO {sheet.capo}
          </span>
          <span className="font-mono-rf bg-neutral-200 px-2 py-1 text-[10px] font-bold tracking-[.08em]">
            {sheet.transposeSemitones > 0 ? "+" : ""}
            {sheet.transposeSemitones} SEMI
          </span>
        </div>
      </div>

      {chordIds.length > 0 && (
        <div className="flex gap-[6px] overflow-x-auto border-b-2 border-divider px-[18px] py-3">
          {chordIds.map((id) => (
            <button
              key={id}
              onClick={() => setActiveChordId(id)}
              className={`shrink-0 px-[10px] py-[6px] font-sans text-xs font-extrabold ${
                activeChordId === id ? "bg-accent text-white" : "border-2 border-ink hover:bg-accent-100 active:bg-accent-200"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      {sheet.sections.length > 0 && (
        <div className="flex gap-[6px] overflow-x-auto border-b-2 border-divider px-[18px] py-3">
          {sheet.sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className="shrink-0 whitespace-nowrap border-2 border-ink px-[10px] py-[6px] font-mono-rf text-[10px] font-bold tracking-[.08em] hover:bg-accent-100 active:bg-accent-200"
            >
              {section.label.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-[2px] border-b-2 border-ink bg-divider">
        <button
          onClick={() => sendToMetronome(sheet)}
          className="bg-bg px-[14px] py-3 text-left font-sans text-xs font-extrabold tracking-[.08em] hover:bg-accent-100 active:bg-accent-200"
        >
          SEND TO METRONOME
        </button>
        <button
          onClick={autoscroll.toggle}
          className={`px-[14px] py-3 text-left font-sans text-xs font-extrabold tracking-[.08em] ${
            autoscroll.enabled ? "bg-accent text-white" : "bg-bg hover:bg-accent-100 active:bg-accent-200"
          }`}
        >
          AUTOSCROLL {autoscroll.enabled ? (autoscroll.paused ? "· PAUSED" : "· ON") : "· OFF"}
        </button>
        <button
          onClick={handleDuplicate}
          className="bg-bg px-[14px] py-3 text-left font-sans text-xs font-extrabold tracking-[.08em] hover:bg-accent-100 active:bg-accent-200"
        >
          DUPLICATE
        </button>
        <button
          onClick={handleDelete}
          className="bg-bg px-[14px] py-3 text-left font-sans text-xs font-extrabold tracking-[.08em] text-accent-700 hover:bg-accent-100 active:bg-accent-200"
        >
          DELETE
        </button>
      </div>

      {autoscroll.enabled && (
        <div className="flex gap-[2px] border-b-2 border-divider px-[18px] py-2">
          {AUTOSCROLL_SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => autoscroll.setSpeed(s)}
              className={`px-[10px] py-1 font-mono-rf text-[9px] font-bold tracking-[.1em] ${
                autoscroll.speed === s ? "bg-ink text-bg" : "bg-neutral-200"
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-8">
        {sheet.sections.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">NO CONTENT YET</div>
            <p className="max-w-[260px] text-sm text-neutral-700">This sheet doesn&apos;t have any content yet.</p>
            <button
              onClick={() => openEditor(sheetId)}
              className="bg-accent px-4 py-3 font-sans text-xs font-extrabold tracking-[.1em] text-white hover:bg-accent-600 active:bg-accent-700"
            >
              EDIT SHEET
            </button>
          </div>
        ) : (
          sheet.sections.map((section) => (
            <div id={`section-${section.id}`} key={section.id} className="pt-6">
              <div className="font-mono-rf mb-2 text-[10px] font-bold tracking-[.14em] text-neutral-600">
                {section.label.toUpperCase()}
              </div>
              {section.lines.map((line, lineIndex) => {
                const highlightRanges = highlightRangesForLine(section.id, lineIndex, line, sheet.annotations);
                const notes = noteAnnotationsForLine(section.id, lineIndex, sheet.annotations);
                return (
                  <div key={lineIndex}>
                    <ChordLyricLine
                      line={line}
                      highlightRanges={highlightRanges}
                      sheet={sheet}
                      onChordTap={setActiveChordId}
                    />
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className="border-l-4 border-ink bg-neutral-200 px-3 py-2 font-mono-rf text-[11px] text-neutral-700"
                      >
                        {note.content}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {activeChordId && (
        <div className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto border-t-2 border-ink bg-bg">
          <button
            onClick={() => setActiveChordId(null)}
            className="w-full border-b-2 border-divider px-4 py-2 text-right font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700"
          >
            CLOSE ✕
          </button>
          <ChordDetail writtenChordId={activeChordId} sheet={sheet} />
        </div>
      )}
    </div>
  );
}
