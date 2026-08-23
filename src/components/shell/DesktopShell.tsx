"use client";

import { ToolId, TOOLS } from "@/lib/tools";
import { useTransportStore, useTunerStore } from "@/lib/store";
import { TunerDesktop } from "../tuner/TunerDesktop";
import { MetronomeDesktop } from "../metronome/MetronomeDesktop";
import { SheetsDesktop } from "../sheets/SheetsDesktop";
import { Placeholder } from "./Placeholder";

export function DesktopShell({
  tool,
  setTool,
}: {
  tool: ToolId;
  setTool: (t: ToolId) => void;
}) {
  const active = TOOLS.find((t) => t.id === tool)!;
  const bpm = useTransportStore((s) => s.bpm);
  const tuning = useTunerStore((s) => s.tuning);

  const sessionLabel =
    tool === "tuner"
      ? `SESSION: ${tuning.toUpperCase()}`
      : tool === "metronome"
      ? `SESSION: ${bpm} BPM`
      : "SESSION: RIFF";

  return (
    <div className="flex h-dvh w-full flex-col bg-bg">
      <header className="flex h-[60px] items-center justify-between border-b-2 border-ink px-5">
        <div className="flex items-baseline gap-4">
          <span className="font-sans text-[26px] font-black leading-none tracking-[-.03em]">RIFF</span>
          <span className="font-mono-rf text-[10px] tracking-[.16em] text-neutral-700">
            PRACTICE DESK · {active.desktopLabel}
          </span>
        </div>
        <div className="flex gap-[2px]">
          <span className="bg-ink px-3 py-[9px] font-sans text-[10px] font-extrabold tracking-[.1em] text-bg">
            {sessionLabel}
          </span>
          <span className="border-2 border-ink px-3 py-[9px] font-sans text-[10px] font-extrabold tracking-[.1em]">
            INSTALL APP
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[196px_1fr_400px]">
        <div className="flex min-h-0 flex-col border-r-2 border-ink">
          {TOOLS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`py-[14px] pl-4 pr-2 text-left font-sans text-[13px] font-extrabold ${
                tool === t.id
                  ? "border-b-2 border-ink bg-accent text-white"
                  : `border-b-2 ${i === TOOLS.length - 1 ? "border-ink" : "border-divider"}`
              }`}
            >
              {t.desktopLabel}
            </button>
          ))}
          <p className="p-4 text-[11px] leading-[1.5] text-neutral-700">
            {tool === "metronome" ? (
              <>
                Space starts and stops the click. <b>[</b> and <b>]</b> nudge tempo by one BPM.
              </>
            ) : (
              <>
                Keyboard: <b>1</b>–<b>5</b> switches tool, <b>space</b> starts the click.
              </>
            )}
          </p>
        </div>

        {tool === "tuner" && <TunerDesktop />}
        {tool === "metronome" && <MetronomeDesktop />}
        {tool === "sheets" && <SheetsDesktop />}
        {tool !== "tuner" && tool !== "metronome" && tool !== "sheets" && (
          <>
            <Placeholder label={active.desktopLabel} />
            <div className="border-l-2 border-ink" />
          </>
        )}
      </div>
    </div>
  );
}
