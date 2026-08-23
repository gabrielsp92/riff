"use client";

import { useState } from "react";
import { Annotation, useSheetEditorStore } from "@/lib/store";

// Annotation tools (sheets-icd-v2.md §6.8). Note: attach to a line (or, per
// Assumption J, a "section" — sugar over targeting that section's
// lineIndex: 0, which a future wiring pass can offer as an extra affordance
// on the section header by rendering this same component with
// `lineIndex={0}` and `label="SECTION"`; storage is identical either way).
// Highlight: manual start/end character pickers (a touch-friendly fallback
// in place of native text selection — more reliable without any new
// dependency or unproven selection-tracking code in this codebase) plus a
// "whole line" checkbox (an omitted range = whole-line highlight, per the
// frozen AnnotationTarget contract). Lists existing annotations for the
// target with edit (re-open pre-filled) and remove actions.
//
// Standalone: identifies its target via `sectionId`/`lineIndex` props and
// reads/writes `useSheetEditorStore` directly — no dependency on any
// sibling T5b-e component.

// "Highlight this chord" one-tap shortcut (sheets-icd-v2.md §6.8,
// Assumption L). Exported as a pure helper (not hard-wired into this
// component) so ChordPlacementEditor.tsx (or a later wiring pass) can call
// it directly from wherever a chord placement is tapped, without needing to
// import this whole editor component.
export function computeChordHighlightRange(
  charIndex: number,
  allPlacementsInLine: Array<{ charIndex: number }>,
  lyricsLength: number
): [number, number] {
  const nextPlacementCharIndex = allPlacementsInLine
    .map((p) => p.charIndex)
    .filter((idx) => idx > charIndex)
    .sort((a, b) => a - b)[0];
  return [charIndex, nextPlacementCharIndex ?? lyricsLength];
}

export interface AnnotationEditorProps {
  sectionId: string;
  lineIndex: number;
  // Overrides the header label — e.g. "SECTION" for the section-header's
  // "add note to whole section" affordance (Assumption J). Defaults to a
  // per-line label.
  label?: string;
}

type DraftKind = "note" | "highlight";

export function AnnotationEditor({ sectionId, lineIndex, label }: AnnotationEditorProps) {
  const lyricsLength = useSheetEditorStore(
    (s) => s.draft?.sections.find((sec) => sec.id === sectionId)?.lines[lineIndex]?.lyrics.length ?? 0
  );
  const annotations = useSheetEditorStore((s) => s.draft?.annotations ?? []);
  const addAnnotation = useSheetEditorStore((s) => s.addAnnotation);
  const updateAnnotation = useSheetEditorStore((s) => s.updateAnnotation);
  const removeAnnotation = useSheetEditorStore((s) => s.removeAnnotation);

  const targetAnnotations = annotations.filter(
    (a) => a.target.sectionId === sectionId && a.target.lineIndex === lineIndex
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<DraftKind>("note");
  const [content, setContent] = useState("");
  const [wholeLine, setWholeLine] = useState(true);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(lyricsLength);

  const openNewForm = (initialKind: DraftKind) => {
    setEditingId(null);
    setKind(initialKind);
    setContent("");
    setWholeLine(true);
    setRangeStart(0);
    setRangeEnd(lyricsLength);
    setFormOpen(true);
  };

  const openEditForm = (annotation: Annotation) => {
    setEditingId(annotation.id);
    setKind(annotation.type);
    setContent(annotation.content ?? "");
    if (annotation.type === "highlight") {
      setWholeLine(annotation.target.range === undefined);
      setRangeStart(annotation.target.range?.[0] ?? 0);
      setRangeEnd(annotation.target.range?.[1] ?? lyricsLength);
    }
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const handleSubmit = () => {
    if (kind === "note") {
      if (content.trim() === "") return; // addAnnotation would no-op anyway; mirror it here for the button's disabled state
      if (editingId) {
        updateAnnotation(editingId, { type: "note", target: { sectionId, lineIndex }, content });
      } else {
        addAnnotation({ type: "note", target: { sectionId, lineIndex }, content });
      }
    } else {
      const range: [number, number] | undefined = wholeLine
        ? undefined
        : [Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd)];
      if (editingId) {
        updateAnnotation(editingId, { type: "highlight", target: { sectionId, lineIndex, range } });
      } else {
        addAnnotation({ type: "highlight", target: { sectionId, lineIndex, range } });
      }
    }
    closeForm();
  };

  return (
    <div className="flex flex-col gap-2 border-2 border-divider p-2">
      <div className="flex items-center justify-between">
        <span className="font-mono-rf text-[10px] tracking-[.1em] text-neutral-600">
          {label ?? `LINE ${lineIndex + 1}`} ANNOTATIONS
        </span>
        <div className="flex gap-2">
          <button onClick={() => openNewForm("note")} className="font-mono-rf text-[10px] font-bold text-accent">
            + NOTE
          </button>
          <button onClick={() => openNewForm("highlight")} className="font-mono-rf text-[10px] font-bold text-accent">
            + HIGHLIGHT
          </button>
        </div>
      </div>

      {targetAnnotations.length === 0 && !formOpen && (
        <p className="font-mono-rf text-[11px] text-neutral-500">No annotations yet.</p>
      )}

      {targetAnnotations.length > 0 && (
        <div className="flex flex-col gap-1">
          {targetAnnotations.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 border-b-2 border-divider py-1 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate font-mono-rf text-[11px] text-neutral-700">
                {a.type === "note"
                  ? `NOTE: ${a.content}`
                  : `HIGHLIGHT ${a.target.range ? `[${a.target.range[0]}, ${a.target.range[1]})` : "(whole line)"}`}
              </span>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => openEditForm(a)}
                  className="font-mono-rf text-[10px] font-bold text-neutral-600 hover:text-accent"
                >
                  EDIT
                </button>
                <button
                  onClick={() => removeAnnotation(a.id)}
                  className="font-mono-rf text-[10px] font-bold text-neutral-600 hover:text-accent"
                >
                  REMOVE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="flex flex-col gap-2 border-2 border-ink p-2">
          <div className="flex gap-[2px]">
            <button
              onClick={() => setKind("note")}
              disabled={editingId !== null}
              className={`px-2 py-1 font-mono-rf text-[10px] font-bold tracking-[.08em] disabled:opacity-40 ${
                kind === "note" ? "bg-accent text-white" : "bg-neutral-200"
              }`}
            >
              NOTE
            </button>
            <button
              onClick={() => setKind("highlight")}
              disabled={editingId !== null}
              className={`px-2 py-1 font-mono-rf text-[10px] font-bold tracking-[.08em] disabled:opacity-40 ${
                kind === "highlight" ? "bg-accent text-white" : "bg-neutral-200"
              }`}
            >
              HIGHLIGHT
            </button>
          </div>

          {kind === "note" ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              placeholder="Note text (required)"
              aria-label="Note text"
              className="w-full resize-none border-2 border-ink bg-transparent px-2 py-2 font-mono-rf text-[12px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent"
            />
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 font-mono-rf text-[11px] text-ink">
                <input type="checkbox" checked={wholeLine} onChange={(e) => setWholeLine(e.target.checked)} />
                Whole line
              </label>
              {!wholeLine && (
                <div className="flex items-center gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="font-mono-rf text-[10px] text-neutral-600">START</span>
                    <input
                      type="number"
                      min={0}
                      max={lyricsLength}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Math.min(lyricsLength, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-16 border-2 border-ink bg-transparent px-1 py-1 font-mono-rf text-[12px] text-ink"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-mono-rf text-[10px] text-neutral-600">END</span>
                    <input
                      type="number"
                      min={0}
                      max={lyricsLength}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(Math.min(lyricsLength, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-16 border-2 border-ink bg-transparent px-1 py-1 font-mono-rf text-[12px] text-ink"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={closeForm}
              className="font-mono-rf text-[10px] font-bold tracking-[.1em] text-neutral-600 hover:text-accent"
            >
              CANCEL
            </button>
            <button
              onClick={handleSubmit}
              disabled={kind === "note" && content.trim() === ""}
              className="bg-accent px-3 py-[6px] font-sans text-[11px] font-extrabold tracking-[.08em] text-white hover:bg-accent-600 disabled:opacity-40"
            >
              {editingId ? "SAVE" : "ADD"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
