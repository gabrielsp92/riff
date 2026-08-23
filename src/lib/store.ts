import { create } from "zustand";
import { TuningName } from "./music";

export type Permission = "idle" | "requesting" | "granted" | "denied";

export interface DetectedPitch {
  name: string;
  octave: number;
  cents: number;
  midi: number;
}

interface TunerState {
  tuning: TuningName;
  a4: number;
  permission: Permission;
  detected: DetectedPitch | null;
  micLevel: number; // 0..1
  bars: number[]; // 0..1 per bar, live waveform meter
  setTuning: (t: TuningName) => void;
  setPermission: (p: Permission) => void;
  setDetected: (d: DetectedPitch | null) => void;
  setMeter: (level: number, bars: number[]) => void;
}

export const useTunerStore = create<TunerState>((set) => ({
  tuning: "Standard E",
  a4: 440,
  permission: "idle",
  detected: null,
  micLevel: 0,
  bars: new Array(28).fill(0),
  setTuning: (tuning) => set({ tuning }),
  setPermission: (permission) => set({ permission }),
  setDetected: (detected) => set({ detected }),
  setMeter: (micLevel, bars) => set({ micLevel, bars }),
}));

export type Subdivision = "quarters" | "eighths" | "sixteenths";
export type ClickSound = "woodblock" | "rim" | "beep";

export interface TempoTrainer {
  enabled: boolean;
  from: number;
  to: number;
  bars: number;
}

export interface Song {
  title: string;
  key: string;
  bpm: number;
}

export const SETLIST: Song[] = [
  { title: "DEAD AIR ON THE HIGHWAY", key: "E", bpm: 96 },
  { title: "CHEAP AMPLIFIER", key: "A", bpm: 112 },
  { title: "SIDE ONE, TRACK TWO", key: "D", bpm: 84 },
  { title: "NIGHT SHIFT BLUES", key: "G", bpm: 72 },
  { title: "BASEMENT TAPE", key: "C", bpm: 128 },
];

interface TransportState {
  bpm: number;
  meter: [number, number];
  subdivision: Subdivision;
  accentBeat: number; // 1-indexed, 0 = no accent
  clickSound: ClickSound;
  running: boolean;
  currentBeat: number; // 0-indexed within bar
  currentBar: number; // 1-indexed, resets each time transport starts
  trainer: TempoTrainer;
  tapTimes: number[];
  setBpm: (bpm: number) => void;
  nudgeBpm: (delta: number) => void;
  setRunning: (r: boolean) => void;
  toggleRunning: () => void;
  tapTempo: () => void;
  setBeat: (beat: number, bar: number) => void;
  cycleSubdivision: () => void;
  cycleAccent: () => void;
  setClickSound: (s: ClickSound) => void;
  toggleTrainer: () => void;
  setTrainerProgress: (bpm: number) => void;
}

const SUBDIVISIONS: Subdivision[] = ["quarters", "eighths", "sixteenths"];

export const useTransportStore = create<TransportState>((set, get) => ({
  bpm: 96,
  meter: [4, 4],
  subdivision: "eighths",
  accentBeat: 1,
  clickSound: "woodblock",
  running: false,
  currentBeat: 0,
  currentBar: 1,
  trainer: { enabled: false, from: 96, to: 128, bars: 8 },
  tapTimes: [],
  setBpm: (bpm) => set({ bpm: Math.min(240, Math.max(30, Math.round(bpm))) }),
  nudgeBpm: (delta) =>
    set((s) => ({ bpm: Math.min(240, Math.max(30, s.bpm + delta)) })),
  setRunning: (running) =>
    set({ running, currentBeat: 0, currentBar: 1 }),
  toggleRunning: () =>
    set((s) => ({ running: !s.running, currentBeat: 0, currentBar: 1 })),
  tapTempo: () => {
    const now = performance.now();
    const taps = [...get().tapTimes.filter((t) => now - t < 2000), now];
    set({ tapTimes: taps });
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avg);
      if (bpm >= 30 && bpm <= 240) set({ bpm });
    }
  },
  setBeat: (currentBeat, currentBar) => set({ currentBeat, currentBar }),
  cycleSubdivision: () =>
    set((s) => {
      const i = SUBDIVISIONS.indexOf(s.subdivision);
      return { subdivision: SUBDIVISIONS[(i + 1) % SUBDIVISIONS.length] };
    }),
  cycleAccent: () =>
    set((s) => {
      // Cycles 1 → 2 → … → meter[0] → 0 (off, flat click) → 1 …
      const next = s.accentBeat === 0 ? 1 : s.accentBeat === s.meter[0] ? 0 : s.accentBeat + 1;
      return { accentBeat: next };
    }),
  setClickSound: (clickSound) => set({ clickSound }),
  toggleTrainer: () =>
    set((s) => ({ trainer: { ...s.trainer, enabled: !s.trainer.enabled } })),
  setTrainerProgress: (bpm) => set({ bpm }),
}));
