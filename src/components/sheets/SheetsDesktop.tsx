"use client";

import { useSheetsNavStore } from "@/lib/store";
import { Placeholder } from "../shell/Placeholder";
import { SheetsList } from "./SheetsList";
import { SheetViewerDesktop } from "./SheetViewerDesktop";

// Sheets tool, desktop layout. Renders as the two right-hand columns of
// DesktopShell's [196px_1fr_400px] grid (rail is rendered by DesktopShell
// itself). Reads useSheetsNavStore().screen (sheets-icd.md §6): "list"
// renders SheetsList in the main pane; "viewer" renders SheetViewerDesktop
// (Epic 04, which supplies its own two-column main pane + right panel); the
// still-unbuilt "editor" (Epic 05) keeps the Placeholder. A single "←
// SHEETS" back control lives here, above the viewer's main pane, so there's
// never a duplicate.
export function SheetsDesktop() {
  const screen = useSheetsNavStore((s) => s.screen);
  const openList = useSheetsNavStore((s) => s.openList);

  if (screen.name === "list") {
    return (
      <>
        <SheetsList />
        <div className="border-l-2 border-ink" />
      </>
    );
  }

  if (screen.name === "viewer") {
    return <SheetViewerDesktop sheetId={screen.sheetId} />;
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          onClick={openList}
          className="border-b-2 border-ink px-[22px] py-[14px] text-left font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700"
        >
          ← SHEETS
        </button>
        <Placeholder label="NEW SHEET" />
      </div>
      <div className="border-l-2 border-ink" />
    </>
  );
}
