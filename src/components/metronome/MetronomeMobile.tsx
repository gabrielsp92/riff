"use client";

import { useTransportStore, SETLIST } from "@/lib/store";
import { tempoMarking } from "@/lib/tempo";

const SUBDIVISION_LABEL: Record<string, string> = {
  quarters: "QUARTERS",
  eighths: "EIGHTHS",
  sixteenths: "SIXTEENTHS",
};

export function MetronomeMobile() {
  const bpm = useTransportStore((s) => s.bpm);
  const meter = useTransportStore((s) => s.meter);
  const subdivision = useTransportStore((s) => s.subdivision);
  const accentBeat = useTransportStore((s) => s.accentBeat);
  const running = useTransportStore((s) => s.running);
  const currentBeat = useTransportStore((s) => s.currentBeat);
  const trainer = useTransportStore((s) => s.trainer);
  const nudgeBpm = useTransportStore((s) => s.nudgeBpm);
  const tapTempo = useTransportStore((s) => s.tapTempo);
  const toggleRunning = useTransportStore((s) => s.toggleRunning);
  const cycleSubdivision = useTransportStore((s) => s.cycleSubdivision);
  const cycleAccent = useTransportStore((s) => s.cycleAccent);
  const toggleTrainer = useTransportStore((s) => s.toggleTrainer);
  const setBpm = useTransportStore((s) => s.setBpm);

  const trainerProgress = Math.round(
    Math.max(0, Math.min(1, (bpm - trainer.from) / (trainer.to - trainer.from))) * 100
  );

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-[18px] pt-4 font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700">
        {tempoMarking(bpm)} · {meter[0]}/{meter[1]} · {running ? "RUNNING" : "STOPPED"}
      </div>

      <div className="flex items-end gap-3 px-[18px] pb-[14px] pt-[2px]">
        <span className="font-sans text-[140px] font-extrabold leading-[.8] tracking-[-.05em]">{bpm}</span>
        <span className="pb-[14px] font-mono-rf text-base font-bold text-neutral-600">BPM</span>
      </div>

      <div className="grid grid-cols-4 border-y-2 border-ink">
        {Array.from({ length: meter[0] }, (_, i) => {
          const active = running && currentBeat === i;
          return (
            <div
              key={i}
              className={`h-[88px] pl-[10px] pt-2 font-sans text-[11px] font-extrabold ${
                i < meter[0] - 1 ? "border-r-2 border-ink" : ""
              } ${active ? "bg-accent text-white" : "text-neutral-600"}`}
            >
              {i + 1}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 border-b-2 border-ink">
        <button
          onClick={() => nudgeBpm(-1)}
          className="border-r-2 border-ink py-[14px] pl-3 text-left font-sans text-[20px] font-extrabold"
        >
          −
        </button>
        <button
          onClick={tapTempo}
          className="border-r-2 border-ink py-[14px] pl-3 text-left font-sans text-xs font-extrabold tracking-[.08em]"
        >
          TAP
        </button>
        <button onClick={() => nudgeBpm(1)} className="py-[14px] pl-3 text-left font-sans text-[20px] font-extrabold">
          +
        </button>
      </div>

      <div className="grid grid-cols-2 border-b-2 border-divider">
        <button onClick={cycleSubdivision} className="border-r-2 border-divider py-[14px] pl-[18px] text-left">
          <div className="font-mono-rf text-[9px] tracking-[.12em] text-neutral-600">SUBDIVISION</div>
          <div className="mt-1 font-sans text-[17px] font-extrabold">{SUBDIVISION_LABEL[subdivision]}</div>
        </button>
        <button onClick={cycleAccent} className="py-[14px] pl-[18px] text-left">
          <div className="font-mono-rf text-[9px] tracking-[.12em] text-neutral-600">ACCENT</div>
          <div className="mt-1 font-sans text-[17px] font-extrabold">
            {accentBeat === 0 ? "OFF" : `BEAT ${accentBeat}`}
          </div>
        </button>
      </div>

      <button onClick={toggleTrainer} className="border-b-2 border-divider px-[18px] py-[14px] text-left">
        <div className="mb-[10px] flex justify-between font-mono-rf text-[10px] tracking-[.12em] text-neutral-700">
          <span>TEMPO TRAINER{trainer.enabled ? "" : " · OFF"}</span>
          <span>
            {trainer.from} → {trainer.to} / {trainer.bars} BARS
          </span>
        </div>
        <div className="relative h-3 bg-neutral-300">
          <div
            className="absolute bottom-0 left-0 top-0 bg-accent"
            style={{ width: `${trainer.enabled ? trainerProgress : 0}%` }}
          />
        </div>
      </button>

      <div className="min-h-0 flex-1 px-[18px] py-[14px]">
        <div className="mb-2 font-mono-rf text-[10px] tracking-[.12em] text-neutral-700">SETLIST TEMPOS</div>
        <div className="flex flex-col">
          {SETLIST.map((s) => (
            <button
              key={s.title}
              onClick={() => setBpm(s.bpm)}
              className="flex items-baseline justify-between border-b-2 border-divider py-2 text-left font-sans text-[11px] font-extrabold tracking-[.02em]"
            >
              <span>{s.title}</span>
              <span className="font-mono-rf text-[10px] text-neutral-700">{s.bpm}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={toggleRunning}
        className="border-t-2 border-ink bg-accent py-4 pl-[18px] text-left font-sans text-[13px] font-extrabold tracking-[.12em] text-white"
      >
        {running ? "STOP CLICK" : "START CLICK"}
      </button>
    </div>
  );
}
