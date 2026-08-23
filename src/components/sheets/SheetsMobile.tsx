"use client";

import { useSheetsNavStore } from "@/lib/store";
import { Placeholder } from "../shell/Placeholder";
import { SheetsList } from "./SheetsList";

// Sheets tool, mobile layout. Reads useSheetsNavStore().screen (sheets-icd.md
// §6): "list" renders SheetsList; "viewer"/"editor" render the existing
// Placeholder (those screens are Epic 04/05) plus a "← SHEETS" back control.
export function SheetsMobile() {
  const screen = useSheetsNavStore((s) => s.screen);
  const openList = useSheetsNavStore((s) => s.openList);

  if (screen.name === "list") {
    return <SheetsList />;
  }

  const label = screen.name === "viewer" ? "SHEET VIEWER" : "NEW SHEET";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        onClick={openList}
        className="border-b-2 border-ink px-[18px] py-3 text-left font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700"
      >
        ← SHEETS
      </button>
      <Placeholder label={label} />
    </div>
  );
}
