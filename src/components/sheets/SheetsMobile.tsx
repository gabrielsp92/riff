"use client";

import { useSheetsNavStore } from "@/lib/store";
import { Placeholder } from "../shell/Placeholder";
import { SheetsList } from "./SheetsList";
import { SheetViewerMobile } from "./SheetViewerMobile";

// Sheets tool, mobile layout. Reads useSheetsNavStore().screen (sheets-icd.md
// §6): "list" renders SheetsList; "viewer" renders SheetViewerMobile (Epic
// 04); "editor" still renders the Placeholder (Epic 05). A single "← SHEETS"
// back control lives here, above both — SheetViewerMobile doesn't render its
// own, so there's never a duplicate.
export function SheetsMobile() {
  const screen = useSheetsNavStore((s) => s.screen);
  const openList = useSheetsNavStore((s) => s.openList);

  if (screen.name === "list") {
    return <SheetsList />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        onClick={openList}
        className="border-b-2 border-ink px-[18px] py-3 text-left font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700"
      >
        ← SHEETS
      </button>
      {screen.name === "viewer" ? <SheetViewerMobile sheetId={screen.sheetId} /> : <Placeholder label="NEW SHEET" />}
    </div>
  );
}
