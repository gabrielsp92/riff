"use client";

import { useEffect } from "react";
import { EditableSheet, useSheetEditorStore, useSheetsNavStore, useSheetsStore } from "@/lib/store";

// Sheet editor, mobile layout (sheets-icd-v2.md §6). Screen skeleton for a
// given `sheetId` (null = new sheet). Owns load()-on-mount, the new-sheet /
// edit-metadata form (bound to updateMeta, §6.2), Save/Cancel navigation
// (§6.11), and the loading/not-found/blank/populated states (§6.12).
//
// Composition note: T5c (SectionEditor), T5d (ChordPlacementEditor +
// ChordPicker), T5e (ChordOverrideEditor), and T5f (AnnotationEditor) are
// built as fully standalone components in this same pass — each depends
// only on `useSheetEditorStore`, not on this file or each other — but are
// deliberately NOT composed into this screen yet. A follow-up wiring task
// slots them into the placeholder section below once this branch and the
// T5c-f branch are both in (mirrors T4g/T5h's own file-collision-avoidance
// precedent — see sheets-tasks-v2.md dispatch guidance §3).
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
    <div className="flex flex-col gap-4 border-b-2 border-ink p-[18px]">
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

      <div className="grid grid-cols-2 gap-4">
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
      </div>

      <div className="grid grid-cols-2 gap-4">
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
              onChange={(e) =>
                updateMeta({ timeSignature: { ...draft.timeSignature, unit: Number(e.target.value) } })
              }
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
    </div>
  );
}

export function SheetEditorMobile({ sheetId }: { sheetId: string | null }) {
  const hydrated = useSheetsStore((s) => s.hydrated);
  const persistenceError = useSheetsStore((s) => s.persistenceError);
  const draft = useSheetEditorStore((s) => s.draft);
  const editingSheetId = useSheetEditorStore((s) => s.editingSheetId);
  const notFound = useSheetEditorStore((s) => s.notFound);
  const openList = useSheetsNavStore((s) => s.openList);
  const openViewer = useSheetsNavStore((s) => s.openViewer);

  // Hydration race (sheets-icd-v2.md §6.1, §8): loading an existing sheet
  // before useSheetsStore finishes hydrating would incorrectly read as
  // not-found. A brand-new sheet (sheetId === null) needs no store read, so
  // it's never gated on hydration.
  useEffect(() => {
    if (sheetId !== null && !hydrated) return;
    useSheetEditorStore.getState().load(sheetId);
  }, [sheetId, hydrated]);

  // load()'s `editingSheetId` is always set to exactly the `sheetId` it was
  // called with (found or not) — so this equality is a reliable "the draft
  // in the store right now actually belongs to these props" check, immune
  // to the render-before-effect-runs flicker a plain `!draft` check would
  // suffer from when `sheetId` prop changes.
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
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">LOADING…</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">SHEET NOT FOUND</div>
        <button
          onClick={openList}
          className="bg-accent px-4 py-3 font-sans text-[12px] font-extrabold tracking-[.1em] text-white hover:bg-accent-600 active:bg-accent-700"
        >
          ← SHEETS
        </button>
      </div>
    );
  }

  if (!draft) return null; // defensive: unreachable once loadedForCurrent && !notFound

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b-2 border-ink px-[18px] py-4">
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
        <div className="border-b-2 border-divider bg-neutral-200 px-[18px] py-2 font-mono-rf text-[10px] tracking-[.1em] text-neutral-700">
          {persistenceError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <MetaForm draft={draft} />

        {/* Placeholder composition points — see file header note. */}
        <div className="border-b-2 border-divider p-[18px] font-mono-rf text-[10px] tracking-[.14em] text-neutral-500">
          SECTIONS, CHORD PLACEMENT, CHORD OVERRIDES AND ANNOTATIONS EDIT HERE — wired in a follow-up pass
        </div>
      </div>
    </div>
  );
}
