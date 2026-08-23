"use client";

import { ToolId, TOOLS } from "@/lib/tools";
import { TunerMobile } from "../tuner/TunerMobile";
import { MetronomeMobile } from "../metronome/MetronomeMobile";
import { SheetsMobile } from "../sheets/SheetsMobile";
import { Placeholder } from "./Placeholder";

export function MobileShell({
  tool,
  setTool,
}: {
  tool: ToolId;
  setTool: (t: ToolId) => void;
}) {
  const active = TOOLS.find((t) => t.id === tool)!;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-bg">
      <header className="flex items-center justify-between border-b-2 border-ink px-[18px] py-4">
        <span className="font-sans text-[22px] font-black leading-none tracking-[-.03em]">RIFF</span>
        <span
          className={`font-mono-rf px-2 py-[5px] text-[10px] tracking-[.14em] ${
            tool === "loop" ? "bg-accent text-white" : "bg-ink text-bg"
          }`}
        >
          {active.headerChip}
        </span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {tool === "tuner" && <TunerMobile />}
        {tool === "metronome" && <MetronomeMobile />}
        {tool === "sheets" && <SheetsMobile />}
        {tool !== "tuner" && tool !== "metronome" && tool !== "sheets" && (
          <Placeholder label={active.desktopLabel} />
        )}
      </main>

      <nav className="grid grid-cols-5 border-t-2 border-ink">
        {TOOLS.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`min-h-[44px] py-3 pl-2 text-left font-sans text-[9px] font-extrabold tracking-[.1em] ${
              i > 0 ? "border-l-2 border-ink" : ""
            } ${tool === t.id ? "bg-accent text-white" : ""}`}
          >
            {t.mobileLabel}
          </button>
        ))}
      </nav>
    </div>
  );
}
