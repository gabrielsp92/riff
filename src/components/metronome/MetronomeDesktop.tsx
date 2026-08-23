"use client";

import { ClickSound, SETLIST, useTransportStore } from "@/lib/store";
import { tempoMarking } from "@/lib/tempo";

const SUBDIVISION_LABEL: Record<string, string> = {
  quarters: "QUARTERS",
  eighths: "EIGHTHS",
  sixteenths: "SIXTEENTHS",
};

const CLICK_SOUNDS: { id: ClickSound; label: string }[] = [
  { id: "woodblock", label: "WOODBLOCK" },
  { id: "rim", label: "RIM" },
  { id: "beep", label: "BEEP" },
];

export function MetronomeDesktop() {
  const bpm = useTransportStore((s) => s.bpm);
  const meter = useTransportStore((s) => s.meter);
  const subdivision = useTransportStore((s) => s.subdivision);
  const running = useTransportStore((s) => s.running);
  const currentBeat = useTransportStore((s) => s.currentBeat);
  const currentBar = useTransportStore((s) => s.currentBar);
  const trainer = useTransportStore((s) => s.trainer);
  const clickSound = useTransportStore((s) => s.clickSound);
  const nudgeBpm = useTransportStore((s) => s.nudgeBpm);
  const tapTempo = useTransportStore((s) => s.tapTempo);
  const toggleRunning = useTransportStore((s) => s.toggleRunning);
  const cycleSubdivision = useTransportStore((s) => s.cycleSubdivision);
  const setClickSound = useTransportStore((s) => s.setClickSound);
  const toggleTrainer = useTransportStore((s) => s.toggleTrainer);
  const setBpm = useTransportStore((s) => s.setBpm);

  const trainerProgress = Math.round(
    Math.max(0, Math.min(1, (bpm - trainer.from) / (trainer.to - trainer.from))) * 100
  );

  return (
    <>
      <div className="flex min-w-0 flex-col">
        <div className="flex justify-between border-b-2 border-ink px-[22px] py-[14px] font-mono-rf text-[10px] tracking-[.14em] text-neutral-700">
          <button onClick={cycleSubdivision} className="text-left">
            {tempoMarking(bpm)} · {meter[0]}/{meter[1]} · {SUBDIVISION_LABEL[subdivision]}
          </button>
          <span>
            {running ? "RUNNING" : "STOPPED"} · BAR {currentBar}
          </span>
        </div>

        <div className="flex items-end gap-[18px] px-[22px] pb-3 pt-[22px]">
          <span className="font-sans text-[190px] font-extrabold leading-[.78] tracking-[-.06em]">{bpm}</span>
          <span className="pb-6 font-mono-rf text-[26px] font-bold text-neutral-600">BPM</span>
        </div>

        <div className="grid grid-cols-4 border-y-2 border-ink">
          {Array.from({ length: meter[0] }, (_, i) => {
            const active = running && currentBeat === i;
            return (
              <div
                key={i}
                className={`h-[120px] pl-[14px] pt-[10px] font-sans text-[13px] font-extrabold ${
                  i < meter[0] - 1 ? "border-r-2 border-ink" : ""
                } ${active ? "bg-accent text-white" : "text-neutral-600"}`}
              >
                {i + 1}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 border-b-2 border-ink">
          <button
            onClick={() => nudgeBpm(-1)}
            className="border-r-2 border-ink py-4 pl-[14px] text-left font-sans text-xs font-extrabold tracking-[.08em]"
          >
            − 1 BPM
          </button>
          <button
            onClick={tapTempo}
            className="border-r-2 border-ink py-4 pl-[14px] text-left font-sans text-xs font-extrabold tracking-[.08em]"
          >
            TAP TEMPO
          </button>
          <button
            onClick={() => nudgeBpm(1)}
            className="border-r-2 border-ink py-4 pl-[14px] text-left font-sans text-xs font-extrabold tracking-[.08em]"
          >
            + 1 BPM
          </button>
          <button
            onClick={toggleRunning}
            className="bg-accent py-4 pl-[14px] text-left font-sans text-xs font-extrabold tracking-[.08em] text-white"
          >
            {running ? "STOP" : "START"}
          </button>
        </div>

        <button onClick={toggleTrainer} className="min-h-0 flex-1 px-[22px] py-4 text-left">
          <div className="mb-[10px] flex justify-between font-mono-rf text-[10px] tracking-[.12em] text-neutral-700">
            <span>
              TEMPO TRAINER{trainer.enabled ? "" : " · OFF"} · {trainer.from} → {trainer.to} OVER{" "}
              {trainer.bars} BARS
            </span>
            <span>{trainer.enabled ? trainerProgress : 0}%</span>
          </div>
          <div className="relative h-[14px] bg-neutral-300">
            <div
              className="absolute bottom-0 left-0 top-0 bg-accent"
              style={{ width: `${trainer.enabled ? trainerProgress : 0}%` }}
            />
          </div>
        </button>
      </div>

      <div className="flex min-h-0 flex-col border-l-2 border-ink">
        <div className="border-b-2 border-ink px-[18px] py-[14px] font-mono-rf text-[10px] tracking-[.14em] text-neutral-700">
          SETLIST TEMPOS
        </div>
        {SETLIST.map((s) => (
          <button
            key={s.title}
            onClick={() => setBpm(s.bpm)}
            className="flex items-baseline justify-between border-b-2 border-divider px-[18px] py-[14px] text-left"
          >
            <span className="font-sans text-[13px] font-extrabold tracking-[.01em]">{s.title}</span>
            <span className="font-mono-rf text-[11px] text-neutral-700">
              {s.bpm} · {s.key}
            </span>
          </button>
        ))}

        <div className="min-h-0 flex-1 px-[18px] py-4">
          <div className="mb-[10px] font-mono-rf text-[10px] tracking-[.14em] text-neutral-700">
            CLICK SOUND
          </div>
          <div className="flex flex-col gap-[2px]">
            {CLICK_SOUNDS.map((c) => (
              <button
                key={c.id}
                onClick={() => setClickSound(c.id)}
                className={`px-3 py-[10px] text-left font-sans text-xs font-extrabold ${
                  clickSound === c.id ? "bg-accent text-white" : "bg-neutral-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
