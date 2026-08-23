"use client";

import { useTuner } from "@/hooks/useTuner";
import { TUNING_NAMES, TuningName } from "@/lib/music";
import { useTunerDisplay } from "./useTunerDisplay";
import { MicGate } from "./MicGate";

export function TunerMobile() {
  const { requestMic } = useTuner();
  const {
    tuning,
    setTuning,
    strings,
    detected,
    bars,
    permission,
    percent,
    inTune,
    activeStringIndex,
    ticks,
  } = useTunerDisplay();

  const stringNumber = activeStringIndex !== null ? 6 - activeStringIndex : 6;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-[18px] pt-4 font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700">
        {tuning.toUpperCase()} · A4 = 440 HZ · STRING {stringNumber}
      </div>

      {permission !== "granted" ? (
        <MicGate permission={permission} onRequest={requestMic} />
      ) : (
        <>
          <div className="flex items-end gap-2 px-[18px] pb-[10px] pt-[2px]">
            <span className="font-sans text-[156px] font-extrabold leading-[.78] tracking-[-.06em]">
              {detected?.name ?? "–"}
            </span>
            <span className="pb-3 font-mono-rf text-[32px] font-bold leading-none text-neutral-600">
              {detected?.octave ?? ""}
            </span>
          </div>

          <div className="px-[18px] pb-[14px]">
            <div className="flex h-[34px] items-end justify-between border-b-2 border-ink">
              {ticks.map((t) => (
                <span key={t.key} className="w-[2px] bg-neutral-500" style={{ height: t.height }} />
              ))}
            </div>
            <div className="relative h-0">
              <div
                className="absolute top-[-46px] h-[46px] w-[4px] -translate-x-1/2 bg-accent"
                style={{ left: `${percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="font-mono-rf text-[13px] font-bold tracking-[.1em]">
                {detected
                  ? `${detected.cents >= 0 ? "+" : ""}${detected.cents} CENTS${
                      detected.cents === 0 ? "" : detected.cents > 0 ? " · SHARP" : " · FLAT"
                    }`
                  : "— NO SIGNAL —"}
              </span>
              {inTune && (
                <span className="bg-accent px-[10px] py-[6px] font-sans text-[10px] font-extrabold tracking-[.14em] text-white">
                  IN TUNE
                </span>
              )}
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-6 border-t-2 border-ink">
        {strings.map((s, i) => {
          const active = i === activeStringIndex;
          return (
            <div
              key={i}
              className={`border-r-2 border-ink py-3 pl-2 ${active ? "bg-accent text-white" : ""}`}
            >
              <div className="font-sans text-[20px] font-extrabold leading-none">{s.note}</div>
              <div
                className={`mt-1 font-mono-rf text-[9px] ${active ? "text-accent-200" : "text-neutral-600"}`}
              >
                {s.note}
                {s.octave}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-[10px] border-t-2 border-divider px-[18px] pb-3 pt-[14px]">
        <div className="font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700">
          MIC INPUT · CHROMATIC
        </div>
        <div className="flex h-[52px] items-end gap-[3px]">
          {bars.map((v, i) => (
            <span
              key={i}
              className="flex-1 bg-neutral-400"
              style={{ height: `${Math.max(4, Math.round(v * 52))}px` }}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 border-t-2 border-divider px-[18px] pb-3 pt-3">
        <div className="mb-2 font-mono-rf text-[10px] font-bold tracking-[.14em] text-neutral-700">
          TUNINGS
        </div>
        <div className="flex flex-col gap-[2px]">
          {TUNING_NAMES.map((name) => {
            const selected = name === tuning;
            return (
              <button
                key={name}
                onClick={() => setTuning(name)}
                className={`flex items-center justify-between px-[10px] py-[9px] text-left ${
                  selected ? "bg-accent text-white" : "bg-neutral-200"
                }`}
              >
                <span className="font-sans text-[12px] font-extrabold">{name.toUpperCase()}</span>
                <span
                  className={`font-mono-rf text-[9px] font-bold ${
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
    </div>
  );
}

const SPELLING: Record<TuningName, string> = {
  "Standard E": "E A D G B E",
  "Drop D": "D A D G B E",
  "Open G": "D G D G B D",
};
