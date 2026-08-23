import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TuningName } from "./music";
import { createSheetsIndexedDbStorage } from "./sheetsPersistence";

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
  id: string;
  title: string;
  key?: string;
  bpm: number;
}

interface SetlistState {
  songs: Song[];
  addSong: (song: Omit<Song, "id">) => void;
  updateSong: (id: string, patch: Partial<Omit<Song, "id">>) => void;
  removeSong: (id: string) => void;
}

// In-memory for the session only — swap for zustand/middleware's `persist`
// (backed by localStorage) once a real persistence layer exists.
export const useSetlistStore = create<SetlistState>((set) => ({
  songs: [
    { id: "seed-1", title: "DEAD AIR ON THE HIGHWAY", key: "E", bpm: 96 },
    { id: "seed-2", title: "CHEAP AMPLIFIER", key: "A", bpm: 112 },
    { id: "seed-3", title: "SIDE ONE, TRACK TWO", key: "D", bpm: 84 },
    { id: "seed-4", title: "NIGHT SHIFT BLUES", key: "G", bpm: 72 },
    { id: "seed-5", title: "BASEMENT TAPE", key: "C", bpm: 128 },
  ],
  addSong: (song) =>
    set((s) => ({ songs: [...s.songs, { ...song, id: crypto.randomUUID() }] })),
  updateSong: (id, patch) =>
    set((s) => ({
      songs: s.songs.map((song) => (song.id === id ? { ...song, ...patch } : song)),
    })),
  removeSong: (id) =>
    set((s) => ({ songs: s.songs.filter((song) => song.id !== id) })),
}));

// ---------------------------------------------------------------------------
// Sheets (chord sheets) — Epic 01, T1a: types + in-memory CRUD store.
// Deliberately a new/separate entity from `Song`/`useSetlistStore` (see
// sheets-icd.md §9 Assumption A) rather than a migration of it.
// ---------------------------------------------------------------------------

export type ChordId = string; // e.g. "E5", "Am", "D7", "G", "F#5" — see chords.ts §4 for canonical form

export interface ChordPlacement {
  charIndex: number; // 0 <= charIndex <= lyrics.length; anchors the chord above this character
  chordId: ChordId;
}

export interface Line {
  lyrics: string; // "" allowed (instrumental/chord-only line)
  chordPlacements: ChordPlacement[]; // sorted ascending by charIndex; may be empty
}

export interface Section {
  id: string; // crypto.randomUUID(); stable — referenced by Annotation.target.sectionId
  label: string; // freeform, e.g. "Verse 1", "Chorus", "Bridge" — NOT an enum
  lines: Line[];
}

export interface ChordOverride {
  chordId: ChordId; // matches a chordId used somewhere in this sheet's chordPlacements
  guitarFrets: string[]; // length 6, LOW-TO-HIGH: [E2, A2, D3, G3, B3, E4] — same order as music.ts's TUNINGS["Standard E"]. Each entry "x" (muted), "0" (open) or a fret number as a string, e.g. "3".
  pianoKeys: string[]; // note-name+octave strings from music.ts's NOTE_NAMES, e.g. ["E3","B3"]. Sharp spelling only (no flats) — see chords.ts §4.
}

export type AnnotationType = "note" | "highlight";

export interface AnnotationTarget {
  sectionId: string; // Section.id
  lineIndex: number; // 0-indexed into section.lines
  range?: [number, number]; // [startCharIndex, endCharIndex) into lyrics; omitted = whole line
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  target: AnnotationTarget;
  content?: string; // REQUIRED at runtime (not just TS) when type === "note"; ignored when type === "highlight"
}

export interface TimeSignature {
  beats: number; // numerator, 1-12 — same clamp range as useTransportStore's meter[0]
  unit: number; // denominator, one of 2 | 4 | 8 | 16 — same allow-list as useTransportStore's ALLOWED_DENOMINATORS
}

export interface Sheet {
  id: string;
  title: string;
  key?: string; // free text tonal center, e.g. "E" — same convention as Song.key
  bpm: number; // 30-240, same clamp as useTransportStore.setBpm
  timeSignature: TimeSignature;
  capo: number; // integer 0-11 (fret position; 0 = no capo)
  transposeSemitones: number; // integer -11..11
  sections: Section[];
  chordOverrides: ChordOverride[];
  annotations: Annotation[];
  createdAt: string; // ISO 8601, set once on creation
  updatedAt: string; // ISO 8601, bumped on every store mutation
}

interface SheetsState {
  sheets: Sheet[];
  hydrated: boolean; // false until the persisted store has finished loading (or determined there's nothing to load)
  persistenceError: string | null; // non-null if the storage backend failed to read/write (sheets-icd.md §3.4); null for corrupt-data fallback (§3.2), which only logs a console.warn

  addSheet: (input: NewSheetInput) => string; // returns the new Sheet's id
  updateSheet: (id: string, patch: Partial<Omit<Sheet, "id" | "createdAt">>) => void; // no-op + no error if id not found (personal-app tolerance, mirrors useSetlistStore.updateSong)
  removeSheet: (id: string) => void; // no-op if id not found
  getSheet: (id: string) => Sheet | undefined;
}

export interface NewSheetInput {
  title: string;
  key?: string;
  bpm: number;
  timeSignature?: TimeSignature; // default { beats: 4, unit: 4 }
  capo?: number; // default 0
  transposeSemitones?: number; // default 0
  sections?: Section[]; // default []
  chordOverrides?: ChordOverride[]; // default []
  annotations?: Annotation[]; // default []
}

const SHEETS_ALLOWED_DENOMINATORS = [2, 4, 8, 16];

function clampBpm(v: number): number {
  return Math.min(240, Math.max(30, Math.round(v)));
}

function clampTimeSignature(ts: TimeSignature | undefined): TimeSignature {
  if (!ts) return { beats: 4, unit: 4 };
  const beats = Math.min(12, Math.max(1, Math.round(ts.beats)));
  const unit = SHEETS_ALLOWED_DENOMINATORS.includes(ts.unit) ? ts.unit : 4;
  return { beats, unit };
}

function clampCapo(v: number): number {
  return Math.min(11, Math.max(0, Math.round(v)));
}

function clampTranspose(v: number): number {
  return Math.min(11, Math.max(-11, Math.round(v)));
}

// Clamps every ChordPlacement.charIndex in a line's chordPlacements into
// [0, lyrics.length] (validation rule, sheets-icd.md §2).
function clampLine(line: Line): Line {
  return {
    lyrics: line.lyrics,
    chordPlacements: line.chordPlacements.map((cp) => ({
      ...cp,
      charIndex: Math.min(line.lyrics.length, Math.max(0, Math.round(cp.charIndex))),
    })),
  };
}

function clampSections(sections: Section[]): Section[] {
  return sections.map((section) => ({
    ...section,
    lines: section.lines.map(clampLine),
  }));
}

const SEED_SHEET_DEAD_AIR: Sheet = {
  id: "sheet-seed-1",
  title: "DEAD AIR ON THE HIGHWAY",
  key: "E",
  bpm: 96,
  timeSignature: { beats: 4, unit: 4 },
  capo: 0,
  transposeSemitones: 0,
  sections: [
    {
      id: "sec-verse-1",
      label: "Verse 1",
      lines: [
        {
          lyrics: "Headlights on the county line",
          chordPlacements: [
            { charIndex: 0, chordId: "E5" },
            { charIndex: 18, chordId: "G5" },
          ],
        },
        {
          lyrics: "Amp hum keeping perfect time",
          chordPlacements: [
            { charIndex: 0, chordId: "A5" },
            { charIndex: 16, chordId: "D5" },
          ],
        },
      ],
    },
    {
      id: "sec-chorus-1",
      label: "Chorus",
      lines: [
        {
          lyrics: "Dead air, dead air on the dial",
          chordPlacements: [
            { charIndex: 0, chordId: "D5" },
            { charIndex: 26, chordId: "A5" },
          ],
        },
        {
          lyrics: "Nothing on for a hundred mile",
          chordPlacements: [
            { charIndex: 0, chordId: "E5" },
            { charIndex: 17, chordId: "G5" },
          ],
        },
      ],
    },
  ],
  chordOverrides: [],
  annotations: [],
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

function metadataOnlySeed(
  id: string,
  title: string,
  key: string,
  bpm: number
): Sheet {
  return {
    id,
    title,
    key,
    bpm,
    timeSignature: { beats: 4, unit: 4 },
    capo: 0,
    transposeSemitones: 0,
    sections: [],
    chordOverrides: [],
    annotations: [],
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
}

const SEED_SHEETS: Sheet[] = [
  SEED_SHEET_DEAD_AIR,
  metadataOnlySeed("sheet-seed-2", "CHEAP AMPLIFIER", "A", 112),
  metadataOnlySeed("sheet-seed-3", "SIDE ONE, TRACK TWO", "D", 84),
  metadataOnlySeed("sheet-seed-4", "NIGHT SHIFT BLUES", "G", 72),
  metadataOnlySeed("sheet-seed-5", "BASEMENT TAPE", "C", 128),
];

// Reports storage-backend read/write failures (IndexedDB unavailable, quota
// exceeded, disabled storage, etc. — sheets-icd.md §3.4) into the store's
// `persistenceError` field. Assigned once `useSheetsStore` exists below;
// the storage adapter is only ever invoked asynchronously (on rehydration
// or a later persist write), well after module evaluation finishes, so this
// forward reference is safe.
let reportPersistenceError: (message: string) => void = () => {};

// IndexedDB persistence via zustand's `persist` middleware (sheets-icd.md
// §3.2). Only `sheets` is persisted (`partialize`); `hydrated` and
// `persistenceError` are runtime-only and never written to storage.
// `hydrated` starts `false` and flips to `true` once rehydration completes,
// whether or not a persisted value existed (a fresh install still counts as
// "hydrated" — it just hydrates to the seed data).
export const useSheetsStore = create<SheetsState>()(
  persist(
    (set, get) => ({
      sheets: SEED_SHEETS,
      hydrated: false,
      persistenceError: null,
      addSheet: (input) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const sheet: Sheet = {
          id,
          title: input.title.trim(),
          key: input.key,
          bpm: clampBpm(input.bpm),
          timeSignature: clampTimeSignature(input.timeSignature),
          capo: clampCapo(input.capo ?? 0),
          transposeSemitones: clampTranspose(input.transposeSemitones ?? 0),
          sections: clampSections(input.sections ?? []),
          chordOverrides: input.chordOverrides ?? [],
          annotations: input.annotations ?? [],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ sheets: [...s.sheets, sheet] }));
        return id;
      },
      updateSheet: (id, patch) =>
        set((s) => ({
          sheets: s.sheets.map((sheet) => {
            if (sheet.id !== id) return sheet;
            const next: Sheet = { ...sheet, ...patch };
            if (patch.title !== undefined) next.title = patch.title.trim();
            if (patch.bpm !== undefined) next.bpm = clampBpm(patch.bpm);
            if (patch.timeSignature !== undefined) next.timeSignature = clampTimeSignature(patch.timeSignature);
            if (patch.capo !== undefined) next.capo = clampCapo(patch.capo);
            if (patch.transposeSemitones !== undefined) next.transposeSemitones = clampTranspose(patch.transposeSemitones);
            if (patch.sections !== undefined) next.sections = clampSections(patch.sections);
            next.updatedAt = new Date().toISOString();
            return next;
          }),
        })),
      removeSheet: (id) =>
        set((s) => ({ sheets: s.sheets.filter((sheet) => sheet.id !== id) })),
      getSheet: (id) => get().sheets.find((sheet) => sheet.id === id),
    }),
    {
      name: "riff-sheets-v1",
      storage: createSheetsIndexedDbStorage((message) =>
        reportPersistenceError(message)
      ),
      partialize: (state) => ({ sheets: state.sheets }),
      onRehydrateStorage: () => () => {
        // Called once rehydration settles, whether or not a persisted value
        // existed or an error occurred along the way (the storage adapter
        // itself never rejects — it catches its own errors and reports them
        // via `reportPersistenceError`) — sheets-icd.md §3.2.
        useSheetsStore.setState({ hydrated: true });
      },
    }
  )
);

reportPersistenceError = (message) => {
  // Guard against re-entrancy: `setState` here goes through `persist`'s
  // wrapped `api.setState`, which always fires another storage write after
  // every state change (including this one) — if storage is genuinely down,
  // that write will fail too and loop back into this same function. Since
  // the message is already reflected in state after the first call, treat a
  // repeat of the same message as a no-op instead of writing (and thus
  // persist-writing, and thus potentially re-erroring) again.
  if (useSheetsStore.getState().persistenceError === message) return;
  useSheetsStore.setState({ persistenceError: message });
};

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
  setMeter: (meter: [number, number]) => void;
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
const ALLOWED_DENOMINATORS = [2, 4, 8, 16];

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
  setMeter: (meter) =>
    set((s) => {
      const numerator = Math.min(12, Math.max(1, Math.round(meter[0])));
      const denominator = ALLOWED_DENOMINATORS.includes(meter[1]) ? meter[1] : s.meter[1];
      const accentBeat = s.accentBeat === 0 ? 0 : Math.min(s.accentBeat, numerator);
      const currentBeat = s.currentBeat >= numerator ? 0 : s.currentBeat;
      return { meter: [numerator, denominator], accentBeat, currentBeat };
    }),
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
