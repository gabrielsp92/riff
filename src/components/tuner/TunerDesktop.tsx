"use client";

import { useTuner } from "@/hooks/useTuner";
import { useTransportStore } from "@/lib/store";
import { TUNING_NAMES, TuningName, stringFreq } from "@/lib/music";
import { playReferenceTone } from "@/lib/referenceTone";
import { useTunerDisplay } from "./useTunerDisplay";
import { MicGate } from "./MicGate";

const SPELLING: Record<TuningName, string> = {
  "Standard E": "E A D G B E",
  "Drop D": "D A D G B E",
  "Open G": "D G D G B D",
};

export function TunerDesktop() {
  const { requestMic } = useTuner();
  const {
    tuning,
    setTuning,
    strings,
    a4,
    detected,
    micLevel,
    permission,
    percent,
    inTune,
    activeStringIndex,
    ticks,
  } = useTunerDisplay();

  const bpm = useTransportStore((s) => s.bpm);
  const running = useTransportStore((s) => s.running);
  const currentBeat = useTransportStore((s) => s.currentBeat);
  const meter = useTransportStore((s) => s.meter);

  return (
    <>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between border-b-2 border-ink px-[22px] py-[14px] font-mono-rf text-[10px] tracking-[.14em] text-neutral-700">
          <span>{tuning.toUpperCase()} · A4 = 440 HZ · CHROMATIC</span>
          <span>MIC LEVEL {Math.round(micLevel * 100)}%</span>
        </div>

        {permission !== "granted" ? (
          <MicGate permission={permission} onRequest={requestMic} />
        ) : (
          <>
            <div className="flex items-end gap-[14px] px-[22px] pb-2 pt-5">
              <span className="font-sans text-[210px] font-extrabold leading-[.76] tracking-[-.07em]">
                {detected?.name ?? "–"}
              </span>
              <span className="pb-[22px] font-mono-rf text-[44px] font-bold leading-none text-neutral-600">
                {detected?.octave ?? ""}
              </span>
              {inTune && (
                <span className="mb-[30px] bg-accent px-3 py-2 font-sans text-xs font-extrabold tracking-[.14em] text-white">
                  IN TUNE
                </span>
              )}
            </div>

            <div className="px-[22px] pb-[18px]">
              <div className="flex h-[46px] items-end justify-between border-b-2 border-ink">
                {ticks.map((t) => (
                  <span key={t.key} className="w-[2px] bg-neutral-500" style={{ height: t.height }} />
                ))}
              </div>
              <div className="relative h-0">
                <div
                  className="absolute top-[-60px] h-[60px] w-[4px] -translate-x-1/2 bg-accent"
                  style={{ left: `${percent}%` }}
                />
              </div>
              <div className="flex justify-between pt-3 font-mono-rf text-[11px] font-bold tracking-[.1em] text-neutral-700">
                <span>−50</span>
                <span className="text-ink">
                  {detected
                    ? `${detected.cents >= 0 ? "+" : ""}${detected.cents} CENTS${
                        detected.cents === 0 ? "" : detected.cents > 0 ? " SHARP" : " FLAT"
                      }`
                    : "NO SIGNAL"}
                </span>
                <span>+50</span>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-6 border-t-2 border-ink">
          {strings.map((s, i) => {
            const active = i === activeStringIndex;
            return (
              <button
                key={i}
                onClick={() => playReferenceTone(stringFreq(s, a4))}
                className={`border-r-2 border-ink py-[14px] pl-3 text-left ${
                  active ? "bg-accent text-white" : "hover:bg-accent-100 active:bg-accent-200"
                }`}
              >
                <div className="font-sans text-[22px] font-extrabold leading-none">{s.note}</div>
                <div
                  className={`mt-[5px] font-mono-rf text-[9px] ${
                    active ? "text-accent-200" : "text-neutral-600"
                  }`}
                >
                  {s.note}
                  {s.octave}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[14px] border-t-2 border-ink px-[22px] py-[18px]">
          <div className="flex justify-between font-mono-rf text-[10px] tracking-[.14em] text-neutral-700">
            <span>METRONOME · {running ? "RUNNING" : "STOPPED"}</span>
            <span>
              {meter[0]}/{meter[1]}
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="font-sans text-[76px] font-extrabold leading-none tracking-[-.04em]">{bpm}</span>
            <span className="font-mono-rf text-xs tracking-[.14em] text-neutral-700">BPM</span>
            <div className="ml-auto flex gap-[6px]">
              {Array.from({ length: meter[0] }, (_, i) => (
                <div
                  key={i}
                  className={`h-11 w-11 ${
                    running && currentBeat === i ? "bg-accent" : "border-2 border-ink"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col border-l-2 border-ink">
        <div className="border-b-2 border-ink px-[18px] py-[14px] font-mono-rf text-[10px] tracking-[.14em] text-neutral-700">
          TUNINGS
        </div>
        <div className="flex flex-col gap-[2px] p-[18px]">
          {TUNING_NAMES.map((name) => {
            const selected = name === tuning;
            return (
              <button
                key={name}
                onClick={() => setTuning(name)}
                className={`flex items-center justify-between px-3 py-[10px] text-left ${
                  selected ? "bg-accent text-white" : "bg-neutral-200"
                }`}
              >
                <span className="font-sans text-[13px] font-extrabold">{name.toUpperCase()}</span>
                <span
                  className={`font-mono-rf text-[10px] font-bold ${
                    selected ? "text-white" : "text-neutral-700"
                  }`}
                >
                  {SPELLING[name]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
