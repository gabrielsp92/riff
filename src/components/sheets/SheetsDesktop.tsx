"use client";

import { useSheetsNavStore } from "@/lib/store";
import { SheetEditorDesktop } from "./SheetEditorDesktop";
import { SheetsList } from "./SheetsList";
import { SheetViewerDesktop } from "./SheetViewerDesktop";

// Sheets tool, desktop layout. Renders as the two right-hand columns of
// DesktopShell's [196px_1fr_400px] grid (rail is rendered by DesktopShell
// itself). Reads useSheetsNavStore().screen (sheets-icd.md §6): "list"
// renders SheetsList in the main pane; "viewer" renders SheetViewerDesktop
// (Epic 04, which supplies its own two-column main pane + right panel);
// "editor" renders SheetEditorDesktop (Epic 05, T5h — same two-fragment-
// column composition). Neither of these two screens needs a wrapper back
// control here; SheetViewerDesktop renders its own, and SheetEditorDesktop
// has its own CANCEL control that navigates correctly per screen contract.
export function SheetsDesktop() {
  const screen = useSheetsNavStore((s) => s.screen);

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

  return <SheetEditorDesktop sheetId={screen.sheetId} />;
}
