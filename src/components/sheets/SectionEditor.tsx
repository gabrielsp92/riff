"use client";

import { useState } from "react";
import { useSheetEditorStore } from "@/lib/store";

// Section tagging UI (sheets-icd-v2.md §6.5). Add/rename/remove sections,
// each showing its lines list + an "add line" affordance. `Section.label`
// is freeform text, not an enum — the preset buttons below only quick-fill
// the free-text field, they never restrict it.
//
// Standalone component: reads/writes `useSheetEditorStore`'s draft directly
// (there is only ever one active draft), no props, no dependency on any
// sibling T5d-f component. Line *content* editing (lyrics/chord placement)
// is intentionally out of this component's scope — that's
// ChordPlacementEditor.tsx's job; this component only manages section/line
// structure. No reordering UI: `Sheet.sections`/`Section.lines` array order
// is exactly insertion order, and `addSection`/`addLine` always append by
// default, so there's nothing to build for that (out of scope per the ICD).
const LABEL_PRESETS = ["Verse", "Chorus", "Bridge", "Solo", "Intro", "Outro"];

export function SectionEditor() {
  const sections = useSheetEditorStore((s) => s.draft?.sections ?? []);
  const addSection = useSheetEditorStore((s) => s.addSection);
  const updateSectionLabel = useSheetEditorStore((s) => s.updateSectionLabel);
  const removeSection = useSheetEditorStore((s) => s.removeSection);
  const addLine = useSheetEditorStore((s) => s.addLine);
  const removeLine = useSheetEditorStore((s) => s.removeLine);

  const [newLabel, setNewLabel] = useState("");

  const handleAddSection = () => {
    const label = newLabel.trim();
    if (!label) return;
    addSection(label);
    setNewLabel("");
  };

  return (
    <div className="flex flex-col gap-4 border-b-2 border-ink p-[18px]">
      <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">SECTIONS</div>

      {sections.length === 0 && (
        <p className="font-mono-rf text-[11px] text-neutral-500">No sections yet — add one below.</p>
      )}

      {sections.map((section) => (
        <div key={section.id} className="border-2 border-divider">
          <div className="flex items-center gap-2 border-b-2 border-divider p-2">
            <input
              type="text"
              value={section.label}
              onChange={(e) => updateSectionLabel(section.id, e.target.value)}
              aria-label={`Section label`}
              className="flex-1 border-2 border-ink bg-transparent px-2 py-1 font-sans text-[13px] font-extrabold outline-none focus-visible:outline-2 focus-visible:outline-accent"
            />
            <button
              onClick={() => removeSection(section.id)}
              className="shrink-0 font-mono-rf text-[10px] font-bold tracking-[.1em] text-neutral-600 hover:text-accent"
            >
              REMOVE SECTION
            </button>
          </div>

          <div className="flex flex-col">
            {section.lines.length === 0 && (
              <div className="p-2 font-mono-rf text-[11px] text-neutral-500">No lines yet.</div>
            )}
            {section.lines.map((line, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b-2 border-divider px-2 py-[6px] last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate font-mono-rf text-[11px] text-neutral-700">
                  {line.lyrics.trim() === "" ? "(empty line)" : line.lyrics}
                  {line.chordPlacements.length > 0 && (
                    <span className="ml-2 text-neutral-500">
                      · {line.chordPlacements.length} chord{line.chordPlacements.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => removeLine(section.id, i)}
                  className="shrink-0 font-mono-rf text-[10px] font-bold tracking-[.1em] text-neutral-600 hover:text-accent"
                >
                  REMOVE
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => addLine(section.id)}
            className="w-full border-t-2 border-divider px-2 py-2 text-left font-mono-rf text-[10px] font-bold tracking-[.1em] text-accent"
          >
            + ADD LINE
          </button>
        </div>
      ))}

      <div className="flex flex-col gap-2 border-2 border-dashed border-divider p-3">
        <div className="flex flex-wrap gap-[6px]">
          {LABEL_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => setNewLabel(preset)}
              className="bg-neutral-200 px-2 py-1 font-mono-rf text-[10px] font-bold tracking-[.08em] hover:bg-accent-100"
            >
              {preset.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSection();
            }}
            placeholder="Section name (e.g. Verse 2)"
            aria-label="New section name"
            className="flex-1 border-2 border-ink bg-transparent px-2 py-2 font-mono-rf text-[12px] outline-none focus-visible:outline-2 focus-visible:outline-accent"
          />
          <button
            onClick={handleAddSection}
            disabled={newLabel.trim() === ""}
            className="bg-accent px-3 py-2 font-sans text-[11px] font-extrabold tracking-[.08em] text-white hover:bg-accent-600 disabled:opacity-40"
          >
            + ADD SECTION
          </button>
        </div>
      </div>
    </div>
  );
}
