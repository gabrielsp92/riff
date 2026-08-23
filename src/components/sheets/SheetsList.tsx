"use client";

import { useState } from "react";
import { filterSheets, useSheetsNavStore, useSheetsStore } from "@/lib/store";

// Sheets library list — title/key/bpm rows following this app's existing
// SETLIST row pattern (see MetronomeMobile/MetronomeDesktop), a search input
// wired to filterSheets (sheets-icd.md §7), and the three required states:
// loading (hydrated === false), empty (hydrated && sheets.length === 0, with
// a prominent "+ New Sheet" CTA), and populated (list + search).
export function SheetsList() {
  const sheets = useSheetsStore((s) => s.sheets);
  const hydrated = useSheetsStore((s) => s.hydrated);
  const persistenceError = useSheetsStore((s) => s.persistenceError);
  const openViewer = useSheetsNavStore((s) => s.openViewer);
  const openEditor = useSheetsNavStore((s) => s.openEditor);

  const [query, setQuery] = useState("");
  const filtered = filterSheets(sheets, query);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b-2 border-ink px-[18px] py-4">
        <span className="font-sans text-[22px] font-extrabold tracking-[-.02em]">SHEETS</span>
        <button
          onClick={() => openEditor(null)}
          className="bg-accent px-3 py-2 font-sans text-[11px] font-extrabold tracking-[.08em] text-white hover:bg-accent-600 active:bg-accent-700"
        >
          + NEW SHEET
        </button>
      </div>

      {persistenceError && (
        <div className="border-b-2 border-divider bg-neutral-200 px-[18px] py-2 font-mono-rf text-[10px] tracking-[.1em] text-neutral-700">
          {persistenceError}
        </div>
      )}

      {hydrated && sheets.length > 0 && (
        <div className="border-b-2 border-ink px-[18px] py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SEARCH TITLE OR KEY"
            aria-label="Search sheets by title or key"
            className="w-full bg-transparent font-mono-rf text-[11px] tracking-[.08em] text-ink outline-none placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!hydrated ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">LOADING…</div>
            <p className="max-w-[260px] text-sm text-neutral-700">Loading your sheets.</p>
          </div>
        ) : sheets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">NO SHEETS YET</div>
            <p className="max-w-[260px] text-sm text-neutral-700">
              Create your first chord sheet to start building your library.
            </p>
            <button
              onClick={() => openEditor(null)}
              className="bg-accent px-4 py-3 font-sans text-[12px] font-extrabold tracking-[.1em] text-white hover:bg-accent-600 active:bg-accent-700"
            >
              + NEW SHEET
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">NO MATCHES</div>
            <p className="max-w-[260px] text-sm text-neutral-700">
              No sheets match &ldquo;{query.trim()}&rdquo;.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((sheet) => (
              <button
                key={sheet.id}
                onClick={() => openViewer(sheet.id)}
                className="flex items-baseline justify-between border-b-2 border-divider px-[18px] py-[14px] text-left hover:bg-accent-100 active:bg-accent-200"
              >
                <span className="font-sans text-[13px] font-extrabold tracking-[.01em]">{sheet.title}</span>
                <span className="font-mono-rf text-[11px] text-neutral-700">
                  {sheet.bpm} · {sheet.key ?? "—"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
