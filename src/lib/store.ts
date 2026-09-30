import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MAX_SEMITONE_SHIFT, TuningName } from "./music";
import { createSheetsIndexedDbStorage } from "./sheetsPersistence";
import { ToolId } from "./tools";

// ---------------------------------------------------------------------------
// Active tool (sheets-icd-v2.md §2) — moved out of Shell.tsx's local
// `useState` into a small Zustand store so a component nested under any
// tool (e.g. the Sheets viewer's "Send to Metronome" button) can switch the
// active tool without prop-drilling `setTool` through Shell/MobileShell/
// DesktopShell.
// ---------------------------------------------------------------------------

interface ToolState {
  tool: ToolId;
  setTool: (t: ToolId) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  tool: "tuner",
  setTool: (tool) => set({ tool }),
}));

export type Permission = "idle" | "requesting" | "granted" | "denied";

export interface DetectedPitch {
  name: string;
  octave: number;
  cents: number;
  midi: number;
}

interface TunerState {
  tuning: TuningName;
  semitoneShift: number; // whole-tuning transpose, applied on top of `tuning`
  a4: number;
  permission: Permission;
  detected: DetectedPitch | null;
  micLevel: number; // 0..1
  bars: number[]; // 0..1 per bar, live waveform meter
  setTuning: (t: TuningName) => void;
  shiftSemitones: (delta: number) => void;
  resetSemitoneShift: () => void;
  setPermission: (p: Permission) => void;
  setDetected: (d: DetectedPitch | null) => void;
  setMeter: (level: number, bars: number[]) => void;
}

export const useTunerStore = create<TunerState>((set) => ({
  tuning: "Standard E",
  semitoneShift: 0,
  a4: 440,
  permission: "idle",
  detected: null,
  micLevel: 0,
  bars: new Array(28).fill(0),
  setTuning: (tuning) => set({ tuning }),
  shiftSemitones: (delta) =>
    set((st) => ({
      semitoneShift: Math.max(
        -MAX_SEMITONE_SHIFT,
        Math.min(MAX_SEMITONE_SHIFT, st.semitoneShift + delta)
      ),
    })),
  resetSemitoneShift: () => set({ semitoneShift: 0 }),
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
  duplicateSheet: (id: string) => string | null; // returns the new sheet's id, or null if id not found (no-op, mirrors removeSheet's tolerance) — sheets-icd-v2.md §6.10
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
      duplicateSheet: (id) => {
        const original = get().sheets.find((sheet) => sheet.id === id);
        if (!original) return null;

        // Section.id and Annotation.id must never be reused from the
        // source (sheets-icd-v2.md §6.10) — Section.id is documented as
        // implicitly unique (Epic 01 ICD §2), so two sheets sharing one
        // would be a landmine for any future cross-sheet section lookup.
        const sectionIdMap = new Map<string, string>();
        const sections: Section[] = original.sections.map((section) => {
          const newSectionId = crypto.randomUUID();
          sectionIdMap.set(section.id, newSectionId);
          return {
            id: newSectionId,
            label: section.label,
            lines: section.lines.map((line) => ({
              lyrics: line.lyrics,
              chordPlacements: line.chordPlacements.map((cp) => ({ ...cp })),
            })),
          };
        });

        const annotations: Annotation[] = original.annotations.map((annotation) => ({
          ...annotation,
          id: crypto.randomUUID(),
          target: {
            ...annotation.target,
            // Remap to the copy's own new Section.id so the copy's
            // annotations still correctly reference the copy's sections.
            sectionId: sectionIdMap.get(annotation.target.sectionId) ?? annotation.target.sectionId,
            range: annotation.target.range ? ([...annotation.target.range] as [number, number]) : undefined,
          },
        }));

        const now = new Date().toISOString();
        const newId = crypto.randomUUID();
        const copy: Sheet = {
          id: newId,
          title: `${original.title} (Copy)`,
          key: original.key,
          bpm: original.bpm,
          timeSignature: { ...original.timeSignature },
          capo: original.capo,
          transposeSemitones: original.transposeSemitones,
          sections,
          chordOverrides: original.chordOverrides.map((o) => ({
            chordId: o.chordId,
            guitarFrets: [...o.guitarFrets],
            pianoKeys: [...o.pianoKeys],
          })),
          annotations,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ sheets: [...s.sheets, copy] }));
        return newId;
      },
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

// ---------------------------------------------------------------------------
// buildLineSegments (sheets-icd-v2.md §3.2) — pure rendering algorithm
// turning a Line + a set of highlight ranges into renderable, chord-
// anchored, highlight-aware text segments. Shared by the viewer's
// `ChordLyricLine` and (optionally) the editor's live preview.
// ---------------------------------------------------------------------------

export interface LineSegment {
  text: string;
  charIndex: number; // start index of this segment within line.lyrics
  chordId: string | null; // chord placed at this segment's start, or null
  highlighted: boolean; // true if this segment falls inside any supplied highlight range
}

export function buildLineSegments(
  line: Line,
  highlightRanges: Array<[number, number]> // [start, end) pairs already filtered to this line
): LineSegment[] {
  const breakpoints = new Set<number>([0, line.lyrics.length]);
  for (const placement of line.chordPlacements) breakpoints.add(placement.charIndex);
  for (const [start, end] of highlightRanges) {
    breakpoints.add(start);
    breakpoints.add(end);
  }
  const sorted = Array.from(breakpoints).sort((a, b) => a - b);

  const segments: LineSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue; // skip zero-length pairs
    const placement = line.chordPlacements.find((cp) => cp.charIndex === start);
    const highlighted = highlightRanges.some(([rStart, rEnd]) => start >= rStart && start < rEnd);
    segments.push({
      text: line.lyrics.slice(start, end),
      charIndex: start,
      chordId: placement ? placement.chordId : null,
      highlighted,
    });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Sheets tool sub-navigation (Epic 03, T3a) — sheets-icd.md §6.
// There's no URL router inside a tool in this app; Sheets is the first tool
// that needs internal sub-navigation (list → viewer → editor). Consistent
// with this app's existing "state per tool persists across tool switches"
// convention — switching to another tool and back does not reset `screen`.
// ---------------------------------------------------------------------------

export type SheetsScreen =
  | { name: "list" }
  | { name: "viewer"; sheetId: string }
  | { name: "editor"; sheetId: string | null }; // null = creating a new sheet, not yet persisted

interface SheetsNavState {
  screen: SheetsScreen;
  openList: () => void;
  openViewer: (sheetId: string) => void;
  openEditor: (sheetId: string | null) => void;
}

export const useSheetsNavStore = create<SheetsNavState>((set) => ({
  screen: { name: "list" },
  openList: () => set({ screen: { name: "list" } }),
  openViewer: (sheetId) => set({ screen: { name: "viewer", sheetId } }),
  openEditor: (sheetId) => set({ screen: { name: "editor", sheetId } }),
}));

// ---------------------------------------------------------------------------
// Sheets list search/filter (Epic 03, T3a) — sheets-icd.md §7. Pure
// function, no store dependency, safe to call on every keystroke.
// ---------------------------------------------------------------------------

export function filterSheets(sheets: Sheet[], query: string): Sheet[] {
  const q = query.trim().toLowerCase();
  if (q === "") return sheets;
  return sheets.filter(
    (sheet) => sheet.title.toLowerCase().includes(q) || (sheet.key ?? "").toLowerCase().includes(q)
  );
}

// ---------------------------------------------------------------------------
// tokenizeWords (Epic 05, T5a) — sheets-icd-v2.md §6.6. Pure word-boundary
// tokenizer for a line's lyrics — the basis of "tap a word to attach a
// chord" in the chord-placement editor.
// ---------------------------------------------------------------------------

export interface WordToken {
  text: string;
  charIndex: number; // start index of the word within the line's lyrics
}

export function tokenizeWords(lyrics: string): WordToken[] {
  return Array.from(lyrics.matchAll(/\S+/g)).map((m) => ({ text: m[0], charIndex: m.index as number }));
}

// ---------------------------------------------------------------------------
// Sheet editor draft state (Epic 05, T5a) — sheets-icd-v2.md §6.1. Decoupled
// from `useSheetsStore` until `save()`: every mutator here only ever touches
// local `draft` state, never the persisted store, so cancelling/discarding
// an in-progress edit never has a side effect on `useSheetsStore`.
// ---------------------------------------------------------------------------

export type EditableSheet = Omit<Sheet, "id" | "createdAt" | "updatedAt">;

interface SheetEditorState {
  draft: EditableSheet | null;
  editingSheetId: string | null; // persisted id if editing an existing sheet; null while creating a new one
  notFound: boolean; // true if load(sheetId) was called with an id useSheetsStore.getSheet() can't find (post-hydration)

  load: (sheetId: string | null) => void;
  updateMeta: (
    patch: Partial<Pick<EditableSheet, "title" | "key" | "bpm" | "timeSignature" | "capo" | "transposeSemitones">>
  ) => void;

  addSection: (label: string) => string; // returns new Section.id
  updateSectionLabel: (sectionId: string, label: string) => void;
  removeSection: (sectionId: string) => void;

  setLineLyrics: (sectionId: string, lineIndex: number, lyrics: string) => void;
  addLine: (sectionId: string, atIndex?: number) => void; // default: append to end of section
  removeLine: (sectionId: string, lineIndex: number) => void;

  setChordPlacement: (sectionId: string, lineIndex: number, charIndex: number, chordId: string | null) => void;

  setChordOverride: (chordId: string, guitarFrets: string[], pianoKeys: string[]) => void; // upsert by chordId
  removeChordOverride: (chordId: string) => void;

  addAnnotation: (annotation: Omit<Annotation, "id">) => string | null; // null (no-op) if type === "note" and content is empty/whitespace
  updateAnnotation: (id: string, patch: Partial<Omit<Annotation, "id">>) => void;
  removeAnnotation: (id: string) => void;

  save: () => string; // persists via useSheetsStore.addSheet / .updateSheet; returns the sheet id; does not navigate
  discard: () => void; // clears draft/editingSheetId/notFound; never touches useSheetsStore
}

function blankEditableSheet(): EditableSheet {
  return {
    title: "",
    key: undefined,
    bpm: 120,
    timeSignature: { beats: 4, unit: 4 },
    capo: 0,
    transposeSemitones: 0,
    sections: [],
    chordOverrides: [],
    annotations: [],
  };
}

// A fresh deep copy of a persisted Sheet's editable fields — never a live
// reference, so mutating the draft can never mutate `useSheetsStore` before
// `save()` (sheets-icd-v2.md §6.1).
function cloneEditableSheet(sheet: Sheet): EditableSheet {
  return {
    title: sheet.title,
    key: sheet.key,
    bpm: sheet.bpm,
    timeSignature: { ...sheet.timeSignature },
    capo: sheet.capo,
    transposeSemitones: sheet.transposeSemitones,
    sections: sheet.sections.map((section) => ({
      id: section.id,
      label: section.label,
      lines: section.lines.map((line) => ({
        lyrics: line.lyrics,
        chordPlacements: line.chordPlacements.map((cp) => ({ ...cp })),
      })),
    })),
    chordOverrides: sheet.chordOverrides.map((o) => ({
      chordId: o.chordId,
      guitarFrets: [...o.guitarFrets],
      pianoKeys: [...o.pianoKeys],
    })),
    annotations: sheet.annotations.map((a) => ({
      ...a,
      target: { ...a.target, range: a.target.range ? ([...a.target.range] as [number, number]) : undefined },
    })),
  };
}

export const useSheetEditorStore = create<SheetEditorState>((set, get) => ({
  draft: null,
  editingSheetId: null,
  notFound: false,

  load: (sheetId) => {
    if (sheetId === null) {
      set({ draft: blankEditableSheet(), editingSheetId: null, notFound: false });
      return;
    }
    const found = useSheetsStore.getState().getSheet(sheetId);
    if (!found) {
      set({ draft: null, editingSheetId: sheetId, notFound: true });
      return;
    }
    set({ draft: cloneEditableSheet(found), editingSheetId: sheetId, notFound: false });
  },

  updateMeta: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : s)),

  addSection: (label) => {
    const newSection: Section = { id: crypto.randomUUID(), label, lines: [] };
    set((s) => (s.draft ? { draft: { ...s.draft, sections: [...s.draft.sections, newSection] } } : s));
    return newSection.id;
  },

  updateSectionLabel: (sectionId, label) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          sections: s.draft.sections.map((sec) => (sec.id === sectionId ? { ...sec, label } : sec)),
        },
      };
    }),

  removeSection: (sectionId) =>
    set((s) => {
      if (!s.draft) return s;
      return { draft: { ...s.draft, sections: s.draft.sections.filter((sec) => sec.id !== sectionId) } };
    }),

  // Assumption H (sheets-icd-v2.md §6.1): only clears this line's
  // chordPlacements + ranged annotations when the text actually changes —
  // a no-op set (same value) clears nothing.
  setLineLyrics: (sectionId, lineIndex, lyrics) =>
    set((s) => {
      if (!s.draft) return s;
      const section = s.draft.sections.find((sec) => sec.id === sectionId);
      const line = section?.lines[lineIndex];
      if (!section || !line || line.lyrics === lyrics) return s;

      const sections = s.draft.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((l, i) => (i === lineIndex ? { lyrics, chordPlacements: [] } : l)),
        };
      });
      // Ranged annotations targeting this exact line are no longer
      // trustworthy against the changed text and are dropped; whole-line
      // annotations (range omitted) aren't char-anchored and are kept.
      const annotations = s.draft.annotations.filter((a) => {
        const targetsThisLine = a.target.sectionId === sectionId && a.target.lineIndex === lineIndex;
        return !(targetsThisLine && a.target.range !== undefined);
      });
      return { draft: { ...s.draft, sections, annotations } };
    }),

  addLine: (sectionId, atIndex) =>
    set((s) => {
      if (!s.draft) return s;
      const sections = s.draft.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const newLine: Line = { lyrics: "", chordPlacements: [] };
        const lines = [...sec.lines];
        const insertAt = atIndex === undefined ? lines.length : Math.min(Math.max(0, atIndex), lines.length);
        lines.splice(insertAt, 0, newLine);
        return { ...sec, lines };
      });
      return { draft: { ...s.draft, sections } };
    }),

  removeLine: (sectionId, lineIndex) =>
    set((s) => {
      if (!s.draft) return s;
      const sections = s.draft.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return { ...sec, lines: sec.lines.filter((_, i) => i !== lineIndex) };
      });
      return { draft: { ...s.draft, sections } };
    }),

  setChordPlacement: (sectionId, lineIndex, charIndex, chordId) =>
    set((s) => {
      if (!s.draft) return s;
      const sections = s.draft.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line, i) => {
            if (i !== lineIndex) return line;
            const withoutExisting = line.chordPlacements.filter((cp) => cp.charIndex !== charIndex);
            const chordPlacements =
              chordId === null
                ? withoutExisting
                : [...withoutExisting, { charIndex, chordId }].sort((a, b) => a.charIndex - b.charIndex);
            return { ...line, chordPlacements };
          }),
        };
      });
      return { draft: { ...s.draft, sections } };
    }),

  setChordOverride: (chordId, guitarFrets, pianoKeys) =>
    set((s) => {
      if (!s.draft) return s;
      const exists = s.draft.chordOverrides.some((o) => o.chordId === chordId);
      const chordOverrides = exists
        ? s.draft.chordOverrides.map((o) => (o.chordId === chordId ? { chordId, guitarFrets, pianoKeys } : o))
        : [...s.draft.chordOverrides, { chordId, guitarFrets, pianoKeys }];
      return { draft: { ...s.draft, chordOverrides } };
    }),

  removeChordOverride: (chordId) =>
    set((s) => {
      if (!s.draft) return s;
      return { draft: { ...s.draft, chordOverrides: s.draft.chordOverrides.filter((o) => o.chordId !== chordId) } };
    }),

  // Mirrors importFile's existing runtime rule (Epic 01 ICD §2: `content` is
  // required at runtime when type === "note") rather than introducing a new
  // one — never mutates `draft` if that rule is violated.
  addAnnotation: (annotation) => {
    if (annotation.type === "note" && !(annotation.content ?? "").trim()) return null;
    const draft = get().draft;
    if (!draft) return null;
    const id = crypto.randomUUID();
    set({ draft: { ...draft, annotations: [...draft.annotations, { ...annotation, id }] } });
    return id;
  },

  updateAnnotation: (id, patch) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          annotations: s.draft.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        },
      };
    }),

  removeAnnotation: (id) =>
    set((s) => {
      if (!s.draft) return s;
      return { draft: { ...s.draft, annotations: s.draft.annotations.filter((a) => a.id !== id) } };
    }),

  // No independent clamping/validation here — hands `draft` straight to
  // useSheetsStore's addSheet/updateSheet, which already enforce every rule
  // in Epic 01 ICD §2 (sheets-icd-v2.md §6.1).
  save: () => {
    const { draft, editingSheetId } = get();
    if (!draft) return editingSheetId ?? ""; // defensive: save() isn't reachable from the not-found state's UI
    if (editingSheetId) {
      useSheetsStore.getState().updateSheet(editingSheetId, draft);
      return editingSheetId;
    }
    return useSheetsStore.getState().addSheet(draft);
  },

  discard: () => set({ draft: null, editingSheetId: null, notFound: false }),
}));

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
