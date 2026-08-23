"use client";

import { useEffect } from "react";
import { EditableSheet, useSheetEditorStore, useSheetsNavStore, useSheetsStore } from "@/lib/store";
import { AnnotationEditor, computeChordHighlightRange } from "./AnnotationEditor";
import { ChordOverrideEditor } from "./ChordOverrideEditor";
import { ChordPlacementEditor } from "./ChordPlacementEditor";
import { SectionEditor } from "./SectionEditor";

// Sheet editor, desktop layout (sheets-icd-v2.md §6). Same screen contract as
// SheetEditorMobile.tsx (see that file's header note for the load()/hydration
// gating rationale and the T5h composition notes) — renders as the two
// right-hand columns of DesktopShell's grid, same fragment convention
// SheetsDesktop.tsx already uses for its "viewer"/"editor" branches.
const TIME_SIGNATURE_UNITS = [2, 4, 8, 16];

const inputClass =
  "w-full border-2 border-ink bg-transparent px-2 py-2 font-mono-rf text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono-rf text-[10px] tracking-[.12em] text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function MetaForm({ draft }: { draft: EditableSheet }) {
  const updateMeta = useSheetEditorStore((s) => s.updateMeta);

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b-2 border-ink p-[22px]">
      <Field label="TITLE">
        <input
          type="text"
          value={draft.title}
          onChange={(e) => updateMeta({ title: e.target.value })}
          placeholder="Untitled sheet"
          className={inputClass}
        />
      </Field>

      <Field label="KEY">
        <input
          type="text"
          value={draft.key ?? ""}
          onChange={(e) => updateMeta({ key: e.target.value === "" ? undefined : e.target.value })}
          placeholder="e.g. E"
          className={inputClass}
        />
      </Field>

      <Field label="TEMPO (BPM, 30–240)">
        <input
          type="number"
          min={30}
          max={240}
          value={draft.bpm}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) updateMeta({ bpm: v });
          }}
          className={inputClass}
        />
      </Field>

      <Field label="CAPO (0–11)">
        <input
          type="number"
          min={0}
          max={11}
          value={draft.capo}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) updateMeta({ capo: v });
          }}
          className={inputClass}
        />
      </Field>

      <Field label="TIME SIGNATURE">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={12}
            value={draft.timeSignature.beats}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) updateMeta({ timeSignature: { ...draft.timeSignature, beats: v } });
            }}
            className={`${inputClass} w-16`}
          />
          <span className="font-mono-rf text-[13px] text-neutral-600">/</span>
          <select
            value={draft.timeSignature.unit}
            onChange={(e) => updateMeta({ timeSignature: { ...draft.timeSignature, unit: Number(e.target.value) } })}
            className={inputClass}
          >
            {TIME_SIGNATURE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field label="TRANSPOSE (SEMI, −11…11)">
        <input
          type="number"
          min={-11}
          max={11}
          value={draft.transposeSemitones}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) updateMeta({ transposeSemitones: v });
          }}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

// "Highlight this chord" one-tap shortcut (sheets-icd-v2.md §6.8,
// Assumption L) — same wiring as SheetEditorMobile.tsx.
function handleHighlightChord(sectionId: string, lineIndex: number, charIndex: number) {
  const line = useSheetEditorStore
    .getState()
    .draft?.sections.find((sec) => sec.id === sectionId)?.lines[lineIndex];
  if (!line) return;
  const range = computeChordHighlightRange(charIndex, line.chordPlacements, line.lyrics.length);
  useSheetEditorStore.getState().addAnnotation({ type: "highlight", target: { sectionId, lineIndex, range } });
}

function SectionsBody({ draft }: { draft: EditableSheet }) {
  if (draft.sections.length === 0) {
    return (
      <p className="border-b-2 border-divider p-[22px] font-mono-rf text-[11px] text-neutral-500">
        Add a section above to start placing lyrics and chords.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 border-b-2 border-divider p-[22px]">
      <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">LYRICS &amp; CHORDS</div>
      {draft.sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-2 border-2 border-divider p-2">
          <div className="font-sans text-[13px] font-extrabold">{section.label}</div>

          {section.lines.length === 0 ? (
            <p className="font-mono-rf text-[11px] text-neutral-500">No lines yet — add one above.</p>
          ) : (
            section.lines.map((_line, lineIndex) => (
              <div key={lineIndex} className="flex flex-col gap-2">
                <ChordPlacementEditor
                  sectionId={section.id}
                  lineIndex={lineIndex}
                  onHighlightChord={handleHighlightChord}
                />
                <AnnotationEditor sectionId={section.id} lineIndex={lineIndex} />
              </div>
            ))
          )}

          <AnnotationEditor sectionId={section.id} lineIndex={0} label="SECTION" />
        </div>
      ))}
    </div>
  );
}

export function SheetEditorDesktop({ sheetId }: { sheetId: string | null }) {
  const hydrated = useSheetsStore((s) => s.hydrated);
  const persistenceError = useSheetsStore((s) => s.persistenceError);
  const draft = useSheetEditorStore((s) => s.draft);
  const editingSheetId = useSheetEditorStore((s) => s.editingSheetId);
  const notFound = useSheetEditorStore((s) => s.notFound);
  const openList = useSheetsNavStore((s) => s.openList);
  const openViewer = useSheetsNavStore((s) => s.openViewer);

  useEffect(() => {
    if (sheetId !== null && !hydrated) return;
    useSheetEditorStore.getState().load(sheetId);
  }, [sheetId, hydrated]);

  const loadedForCurrent = editingSheetId === sheetId;

  const handleSave = () => {
    const id = useSheetEditorStore.getState().save();
    openViewer(id);
  };

  const handleCancel = () => {
    const currentEditingId = useSheetEditorStore.getState().editingSheetId;
    useSheetEditorStore.getState().discard();
    if (currentEditingId === null) openList();
    else openViewer(currentEditingId);
  };

  if (!loadedForCurrent) {
    return (
      <>
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">LOADING…</div>
        </div>
        <div className="border-l-2 border-ink" />
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">SHEET NOT FOUND</div>
          <button
            onClick={openList}
            className="bg-accent px-4 py-3 font-sans text-[12px] font-extrabold tracking-[.1em] text-white hover:bg-accent-600 active:bg-accent-700"
          >
            ← SHEETS
          </button>
        </div>
        <div className="border-l-2 border-ink" />
      </>
    );
  }

  if (!draft) return null; // defensive: unreachable once loadedForCurrent && !notFound

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b-2 border-ink px-[22px] py-[14px]">
          <span className="font-sans text-[18px] font-extrabold tracking-[-.02em]">
            {editingSheetId === null ? "NEW SHEET" : "EDIT SHEET"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-2 font-sans text-[11px] font-extrabold tracking-[.08em] text-neutral-700 hover:text-accent"
            >
              CANCEL
            </button>
            <button
              onClick={handleSave}
              className="bg-accent px-3 py-2 font-sans text-[11px] font-extrabold tracking-[.08em] text-white hover:bg-accent-600 active:bg-accent-700"
            >
              SAVE
            </button>
          </div>
        </div>

        {persistenceError && (
          <div className="border-b-2 border-divider bg-neutral-200 px-[22px] py-2 font-mono-rf text-[10px] tracking-[.1em] text-neutral-700">
            {persistenceError}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <MetaForm draft={draft} />
          <SectionEditor />
          <SectionsBody draft={draft} />
          <ChordOverrideEditor />
        </div>
      </div>
      <div className="border-l-2 border-ink" />
    </>
  );
}
