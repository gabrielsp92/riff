"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// Sheet viewer, desktop layout (sheets-icd-v2.md §5). Renders as the two
// right-hand columns of DesktopShell's [196px_1fr_400px] grid (rail is
// rendered by DesktopShell itself), matching TunerDesktop/MetronomeDesktop's
// composition pattern: a main pane fragment child + a `border-l-2 border-ink`
// right panel fragment child. Same feature set and state coverage as
// SheetViewerMobile (§5.8) — the two-column verse/chorus body + right panel
// for chord chips/tablature/piano/transpose controls is the desktop-only
// difference (docs/DESIGN.md's desktop chord-sheets spec). Unlike the mobile
// viewer, this component renders its own "← SHEETS" back control (top of
// the main pane) rather than relying on a wrapper — desktop's two-grid-
// column composition (main pane + right panel as sibling grid children,
// same pattern as TunerDesktop/MetronomeDesktop) doesn't leave room for a
// shared back-button row above just the main pane. SheetsDesktop.tsx does
// not render a second one for this screen.
export function SheetViewerDesktop({ sheetId }: { sheetId: string }) {
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

  // Delete/duplicate (sheets-icd-v2.md §6.9, Assumption P) — same behavior
  // as SheetViewerMobile.tsx.
  const handleDelete = () => {
    if (!window.confirm(`Delete "${sheet?.title ?? "this sheet"}"? This can't be undone.`)) return;
    useSheetsStore.getState().removeSheet(sheetId);
    openList();
  };

  const handleDuplicate = () => {
    const newId = useSheetsStore.getState().duplicateSheet(sheetId);
    if (newId) openViewer(newId);
  };

  // Default the right panel's chord detail to the sheet's first chord once
  // it's known, so the panel isn't blank before the user taps anything.
  useEffect(() => {
    setActiveChordId(null);
  }, [sheetId]);
  const displayedChordId = activeChordId ?? chordIds[0] ?? null;

  const persistenceBanner = persistenceError && (
    <div className="border-b-2 border-divider bg-neutral-200 px-[22px] py-2 font-mono-rf text-[10px] tracking-[.1em] text-neutral-700">
      {persistenceError}
    </div>
  );

  const backButton = (
    <button
      onClick={openList}
      className="border-b-2 border-ink px-[22px] py-[14px] text-left font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700"
    >
      ← SHEETS
    </button>
  );

  if (!hydrated) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">
          {backButton}
          {persistenceBanner}
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">LOADING…</div>
            <p className="max-w-[260px] text-sm text-neutral-700">Loading this sheet.</p>
          </div>
        </div>
        <div className="border-l-2 border-ink" />
      </>
    );
  }

  if (!sheet) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">
          {backButton}
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
        <div className="border-l-2 border-ink" />
      </>
    );
  }

  const leftColumnSections = sheet.sections.filter((_, i) => i % 2 === 0);
  const rightColumnSections = sheet.sections.filter((_, i) => i % 2 !== 0);

  const renderSection = (section: (typeof sheet.sections)[number]) => (
    <div id={`section-${section.id}`} key={section.id} className="pb-8">
      <div className="font-mono-rf mb-2 text-[10px] font-bold tracking-[.14em] text-neutral-600">
        {section.label.toUpperCase()}
      </div>
      {section.lines.map((line, lineIndex) => {
        const highlightRanges = highlightRangesForLine(section.id, lineIndex, line, sheet.annotations);
        const notes = noteAnnotationsForLine(section.id, lineIndex, sheet.annotations);
        return (
          <div key={lineIndex}>
            <ChordLyricLine line={line} highlightRanges={highlightRanges} sheet={sheet} onChordTap={setActiveChordId} />
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
  );

  return (
    <>
      <div className="flex min-w-0 flex-col">
        {backButton}
        {persistenceBanner}

        <div className="border-b-2 border-ink px-[22px] py-[18px]">
          <div className="font-sans text-[40px] font-extrabold leading-[1] tracking-[-.02em]">{sheet.title}</div>
          <div className="mt-2 font-mono-rf text-[11px] tracking-[.12em] text-neutral-700">
            KEY OF {sheet.key ?? "—"} · {sheet.bpm} BPM · {sheet.timeSignature.beats}/{sheet.timeSignature.unit}
            {currentSectionLabel ? ` · ${currentSectionLabel.toUpperCase()}` : ""}
          </div>
        </div>

        {sheet.sections.length > 0 && (
          <div className="flex flex-wrap gap-[6px] border-b-2 border-divider px-[22px] py-3">
            {sheet.sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className="border-2 border-ink px-[10px] py-[6px] font-mono-rf text-[10px] font-bold tracking-[.08em] hover:bg-accent-100 active:bg-accent-200"
              >
                {section.label.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {autoscroll.enabled && (
          <div className="flex items-center gap-[6px] border-b-2 border-divider px-[22px] py-2 font-mono-rf text-[9px] tracking-[.1em] text-neutral-700">
            <span>AUTOSCROLL{autoscroll.paused ? " · PAUSED" : " · ON"}</span>
            {AUTOSCROLL_SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => autoscroll.setSpeed(s)}
                className={`px-[10px] py-1 font-bold ${autoscroll.speed === s ? "bg-ink text-bg" : "bg-neutral-200 text-ink"}`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[18px]">
          {sheet.sections.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">NO CONTENT YET</div>
              <p className="max-w-[300px] text-sm text-neutral-700">This sheet doesn&apos;t have any content yet.</p>
              <button
                onClick={() => openEditor(sheetId)}
                className="bg-accent px-4 py-3 font-sans text-xs font-extrabold tracking-[.1em] text-white hover:bg-accent-600 active:bg-accent-700"
              >
                EDIT SHEET
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x-2 divide-ink">
              <div className="pr-8">{leftColumnSections.map(renderSection)}</div>
              <div className="pl-8">{rightColumnSections.map(renderSection)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col border-l-2 border-ink">
        <div className="flex items-center justify-between border-b-2 border-ink px-[18px] py-[14px] font-mono-rf text-[10px] tracking-[.14em] text-neutral-700">
          <span>CHORD SHEET</span>
        </div>

        <div className="flex gap-[2px] border-b-2 border-divider px-[18px] py-[14px]">
          <span className="font-mono-rf bg-neutral-200 px-2 py-1 text-[10px] font-bold tracking-[.08em]">
            CAPO {sheet.capo}
          </span>
          <span className="font-mono-rf bg-neutral-200 px-2 py-1 text-[10px] font-bold tracking-[.08em]">
            {sheet.transposeSemitones > 0 ? "+" : ""}
            {sheet.transposeSemitones} SEMI
          </span>
        </div>

        <div className="flex flex-col gap-[2px] border-b-2 border-divider px-[18px] py-[14px]">
          <button
            onClick={() => sendToMetronome(sheet)}
            className="border-2 border-ink px-3 py-[10px] text-left font-sans text-xs font-extrabold tracking-[.08em] hover:bg-accent-100 active:bg-accent-200"
          >
            SEND TO METRONOME
          </button>
          <button
            onClick={autoscroll.toggle}
            className={`px-3 py-[10px] text-left font-sans text-xs font-extrabold tracking-[.08em] ${
              autoscroll.enabled ? "bg-accent text-white" : "border-2 border-ink hover:bg-accent-100 active:bg-accent-200"
            }`}
          >
            AUTOSCROLL {autoscroll.enabled ? (autoscroll.paused ? "· PAUSED" : "· ON") : "· OFF"}
          </button>
          <button
            onClick={handleDuplicate}
            className="border-2 border-ink px-3 py-[10px] text-left font-sans text-xs font-extrabold tracking-[.08em] hover:bg-accent-100 active:bg-accent-200"
          >
            DUPLICATE
          </button>
          <button
            onClick={handleDelete}
            className="border-2 border-ink px-3 py-[10px] text-left font-sans text-xs font-extrabold tracking-[.08em] text-accent-700 hover:bg-accent-100 active:bg-accent-200"
          >
            DELETE
          </button>
        </div>

        {chordIds.length > 0 && (
          <div className="border-b-2 border-divider px-[18px] py-[14px]">
            <div className="mb-2 font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">CHORDS</div>
            <div className="flex flex-wrap gap-[6px]">
              {chordIds.map((id) => (
                <button
                  key={id}
                  onClick={() => setActiveChordId(id)}
                  className={`px-[10px] py-[6px] font-sans text-xs font-extrabold ${
                    displayedChordId === id
                      ? "bg-accent text-white"
                      : "border-2 border-ink hover:bg-accent-100 active:bg-accent-200"
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {displayedChordId ? (
            <ChordDetail writtenChordId={displayedChordId} sheet={sheet} />
          ) : (
            <div className="p-[18px] font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">
              NO CHORDS IN THIS SHEET
            </div>
          )}
        </div>
      </div>
    </>
  );
}
