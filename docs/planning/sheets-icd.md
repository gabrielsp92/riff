# Sheets — Interface Control Document (Epics 01–03)

Status: draft for review. Covers Epic 01 (data + local storage), Epic 02
(chord dictionary + voicing lookup), Epic 03 (sheets list screen).
Viewer (Epic 04) and editor (Epic 05) are out of scope but two contracts
here — the `Sheet` shape and the sheets navigation store — are written so
those epics can build against them later without reopening this doc.

## 0. How to read this doc for a backend-less app

RIFF has no server: "backend" work in this feature is the `src/lib/**`
data/logic layer (types, Zustand stores, persistence, chord math);
"frontend" work is `src/components/**`. There are no HTTP endpoints, so
each "endpoint" below is a **module export** (a function or a store hook),
and each "status code" is a **return-value variant** (a discriminated
union member) that the calling component branches on instead of an HTTP
status. Same rigor as a REST ICD, adapted to the actual shape of this
codebase — errors are always returned, never thrown, from any function a
component calls directly, so the frontend never needs a try/catch to
build correct UI.

Note on source access: the roadmap artifact URL in the task brief could
not be fetched from this environment (no network/browser tool available
here). Everything below is derived from the very detailed epic
descriptions provided directly in the task, plus `docs/DESIGN.md` (which
already specifies the Chord Sheets screen's visual spec and gives one
worked sample song), and the existing codebase. Flag if the un-seen
roadmap doc contradicts anything here.

---

## 1. Module surface ("endpoints")

| Surface | Module | Owner epic | Purpose |
| --- | --- | --- | --- |
| `Sheet`, `Section`, `Line`, `ChordOverride`, `Annotation`, `TimeSignature` types | `src/lib/store.ts` | 01 | Shared data shapes |
| `useSheetsStore` (Zustand hook) | `src/lib/store.ts` | 01 | CRUD + read access to the sheet library, hydration/error state |
| IndexedDB persistence adapter | `src/lib/sheetsPersistence.ts` | 01 | Wires `useSheetsStore` to `persist` middleware |
| `exportSheet`, `exportLibrary`, `importFile` | `src/lib/sheetsImportExport.ts` | 01 | Backup/restore round-trip |
| `lookupChordShape` | `src/lib/chords.ts` | 02 | Dictionary lookup + fallback |
| `resolveChordDisplay` | `src/lib/chords.ts` | 02 | Override resolution + capo/transpose display math (composes `lookupChordShape`) |
| `transposeChordId` | `src/lib/chords.ts` | 02 | Pitch-shift a chord name by N semitones |
| `applyCapo` | `src/lib/chords.ts` | 02 | Numeric fret-offset display math |
| `useSheetsNavStore` (Zustand hook) | `src/lib/store.ts` | 03 | Sheets-tool sub-screen navigation (list/viewer/editor), consumed by 04/05 later |
| `filterSheets` | `src/lib/store.ts` (co-located with the store) or `src/components/sheets/SheetsList.tsx` | 03 | Title/key search |
| `SheetsMobile`, `SheetsDesktop`, `SheetsList` | `src/components/sheets/*.tsx` | 03 | List screen UI, wired into `MobileShell`/`DesktopShell` |

Auth: none — single-user local app, no auth concept anywhere in the repo.

---

## 2. Shared types (Epic 01 — the contract 02 and 03 build against)

Added to `src/lib/store.ts`, next to (not replacing) the existing `Song` /
`useSetlistStore`. See **Assumption A** for why `Sheet` is a new, separate
entity rather than a migration of `Song`.

```ts
export type ChordId = string; // e.g. "E5", "Am", "D7", "G", "F#5" — see chords.ts §4 for canonical form

export interface ChordPlacement {
  charIndex: number;   // 0 <= charIndex <= lyrics.length; anchors the chord above this character
  chordId: ChordId;
}

export interface Line {
  lyrics: string;                       // "" allowed (instrumental/chord-only line)
  chordPlacements: ChordPlacement[];    // sorted ascending by charIndex; may be empty
}

export interface Section {
  id: string;        // crypto.randomUUID(); stable — referenced by Annotation.target.sectionId
  label: string;      // freeform, e.g. "Verse 1", "Chorus", "Bridge" — NOT an enum
  lines: Line[];
}

export interface ChordOverride {
  chordId: ChordId;          // matches a chordId used somewhere in this sheet's chordPlacements
  guitarFrets: string[];     // length 6, LOW-TO-HIGH: [E2, A2, D3, G3, B3, E4] — same order as music.ts's TUNINGS["Standard E"]. Each entry "x" (muted), "0" (open) or a fret number as a string, e.g. "3".
  pianoKeys: string[];       // note-name+octave strings from music.ts's NOTE_NAMES, e.g. ["E3","B3"]. Sharp spelling only (no flats) — see chords.ts §4.
}

export type AnnotationType = "note" | "highlight";

export interface AnnotationTarget {
  sectionId: string;         // Section.id
  lineIndex: number;         // 0-indexed into section.lines
  range?: [number, number];  // [startCharIndex, endCharIndex) into lyrics; omitted = whole line
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  target: AnnotationTarget;
  content?: string;          // REQUIRED at runtime (not just TS) when type === "note"; ignored when type === "highlight"
}

export interface TimeSignature {
  beats: number;  // numerator, 1-12 — same clamp range as useTransportStore's meter[0]
  unit: number;   // denominator, one of 2 | 4 | 8 | 16 — same allow-list as useTransportStore's ALLOWED_DENOMINATORS
}

export interface Sheet {
  id: string;
  title: string;
  key?: string;                  // free text tonal center, e.g. "E" — same convention as Song.key
  bpm: number;                   // 30-240, same clamp as useTransportStore.setBpm
  timeSignature: TimeSignature;
  capo: number;                  // integer 0-11 (fret position; 0 = no capo)
  transposeSemitones: number;    // integer -11..11
  sections: Section[];
  chordOverrides: ChordOverride[];
  annotations: Annotation[];
  createdAt: string;             // ISO 8601, set once on creation
  updatedAt: string;             // ISO 8601, bumped on every store mutation
}
```

Validation rules (enforced by the store's action functions, not just types,
since import brings in untrusted JSON — see §3.3):

- `title`: non-empty after `.trim()`.
- `bpm`: `Math.min(240, Math.max(30, Math.round(v)))` — identical clamp to `useTransportStore.setBpm`.
- `timeSignature.beats`: `Math.min(12, Math.max(1, Math.round(v)))`.
- `timeSignature.unit`: must be one of `[2,4,8,16]`; invalid values fall back to `4`.
- `capo`: `Math.min(11, Math.max(0, Math.round(v)))`.
- `transposeSemitones`: `Math.min(11, Math.max(-11, Math.round(v)))`.
- `ChordPlacement.charIndex`: clamped into `[0, lyrics.length]` on write.
- `Section.id` / `Annotation.id`: generated with `crypto.randomUUID()`, never user-editable.

## 3. `useSheetsStore` — public hook API (Epic 01)

```ts
interface SheetsState {
  sheets: Sheet[];
  hydrated: boolean;              // false until the persisted store has finished loading (or determined there's nothing to load)
  persistenceError: string | null; // non-null if the storage backend failed to read/write — see §3.4

  addSheet: (input: NewSheetInput) => string;              // returns the new Sheet's id
  updateSheet: (id: string, patch: Partial<Omit<Sheet, "id" | "createdAt">>) => void; // no-op + no error if id not found (personal-app tolerance, mirrors useSetlistStore.updateSong)
  removeSheet: (id: string) => void;                        // no-op if id not found
  getSheet: (id: string) => Sheet | undefined;
}

interface NewSheetInput {
  title: string;
  key?: string;
  bpm: number;
  timeSignature?: TimeSignature;   // default { beats: 4, unit: 4 }
  capo?: number;                   // default 0
  transposeSemitones?: number;     // default 0
  sections?: Section[];            // default []
  chordOverrides?: ChordOverride[]; // default []
  annotations?: Annotation[];       // default []
}
```

`useSheetsStore` follows the same call pattern as `useSetlistStore`
(`useSheetsStore((s) => s.sheets)`, etc.) — no new conventions introduced.

### 3.1 Seed data (ships in the store's initial state)

Five seed sheets, titles matching `useSetlistStore`'s existing five songs
for continuity (`id`s are independent — see Assumption A) but **not** kept
in sync with them. Only the first carries full section/lyric/chord
content (this is the sample content already approved in `docs/DESIGN.md`);
the other four are metadata-only stubs, useful for exercising the list
screen's title/key/bpm rendering without full content:

- `DEAD AIR ON THE HIGHWAY` — key E, 96 bpm, 4/4, capo 0, transpose 0 — full content, see §5.1 for the exact payload.
- `CHEAP AMPLIFIER` — key A, 112 bpm, 4/4, no sections/overrides/annotations.
- `SIDE ONE, TRACK TWO` — key D, 84 bpm, 4/4, empty.
- `NIGHT SHIFT BLUES` — key G, 72 bpm, 4/4, empty.
- `BASEMENT TAPE` — key C, 128 bpm, 4/4, empty.

### 3.2 Persistence (`src/lib/sheetsPersistence.ts`)

**Decision: IndexedDB, not localStorage**, wired through Zustand's
`persist` middleware with a custom `PersistStorage` adapter (this repo's
own comment in `store.ts` already earmarks `persist` for this; IndexedDB
over localStorage specifically because sheets carry arbitrarily long
nested arrays — localStorage's ~5MB synchronous-stringify model doesn't
scale to that and would jank the main thread on every save, IndexedDB's
async structured-clone API does).

New dependency: `idb-keyval` (~600B gzipped) for the adapter — the
zustand-recommended way to back `persist` with IndexedDB. Add to
`package.json` `dependencies`.

- Storage key: `"riff-sheets-v1"`.
- Only `sheets` is persisted (`partialize`); `hydrated` and
  `persistenceError` are always runtime-only.
- `onRehydrateStorage` sets `hydrated: true` once loading completes,
  **whether or not a persisted value existed** (a brand-new install with
  no IndexedDB entry yet is still "hydrated" — it just hydrates to the
  seed data).
- If persisted data fails to parse/validate (e.g. corrupted record from a
  future format version), the adapter drops it and falls back to seed
  data rather than crashing the store on boot; this is logged to
  `console.warn`, not surfaced as `persistenceError` (that field is
  reserved for read/write failures, not stale-data recovery).

### 3.3 Export / import (`src/lib/sheetsImportExport.ts`)

This is the **only** backup mechanism in this pass — no cloud sync — so
the round-trip contract must be exact.

```ts
interface SheetExportFile {
  formatVersion: 1;
  kind: "sheet";
  exportedAt: string;      // ISO 8601
  sheet: Sheet;
}

interface LibraryExportFile {
  formatVersion: 1;
  kind: "library";
  exportedAt: string;
  sheets: Sheet[];
}

function exportSheet(id: string): SheetExportFile | null;    // null if id not found
function exportLibrary(): LibraryExportFile;                  // never empty-fails; sheets: [] is valid

type ImportResult =
  | { ok: true; importedSheetIds: string[]; count: number }
  | { ok: false; error: ImportError };

interface ImportError {
  code: "invalid_json" | "unsupported_format_version" | "malformed_sheet";
  message: string;   // human-readable, safe to show verbatim in the UI
  details?: unknown; // e.g. which field failed validation — for a console.error, not for display
}

function importFile(raw: unknown): ImportResult; // raw = JSON.parse result of the file's text; never throws
```

Rules:

- Both file kinds share `formatVersion` so a future shape change can
  branch on it; only `1` exists today, and `importFile` rejects any other
  value with `unsupported_format_version` rather than guessing.
- **`id`, `createdAt`, `updatedAt` are excluded from the losslessness
  contract.** `importFile` always assigns fresh `id`s (via
  `crypto.randomUUID()`) and resets `createdAt`/`updatedAt` to the import
  time, and always **appends** — it never overwrites an existing sheet by
  id. This makes import non-destructive by construction: re-importing the
  same file twice yields two sheets, never data loss or silent
  clobbering. (See Assumption C.)
- Every other field on `Sheet` must round-trip byte-for-byte:
  `title, key, bpm, timeSignature, capo, transposeSemitones, sections,
  chordOverrides, annotations`.
- `importFile` runs a full runtime shape check (not just `JSON.parse`
  succeeding) before touching the store — required fields present,
  correct primitive types, `chordPlacements[].charIndex` within bounds,
  `annotations[].type` one of the two allowed values. Any failure returns
  `malformed_sheet` with `details` naming the first offending field; it
  never partially imports a malformed sheet.
- The actual file I/O (triggering a download, opening a file picker) is a
  frontend concern (Epic 04/05, since there's no export/import UI in
  Epics 01-03's scope) — `exportSheet`/`exportLibrary`/`importFile` are
  pure data functions that a component wraps with
  `new Blob([JSON.stringify(...)])` / `<input type="file">` /
  `FileReader` when that UI exists. Nothing in Epics 01-03 needs to render
  this, but the functions must exist and be tested now per the epic
  description, so a later epic doesn't need to design the contract.

### 3.4 Failure state the epic description didn't call out explicitly

If IndexedDB itself is unavailable (private browsing in some browsers,
quota exceeded, disabled storage), reads/writes will throw. The adapter
catches this, sets `persistenceError` to a short human-readable string
(e.g. `"Storage unavailable — changes won't be saved this session."`),
and keeps the store fully functional in memory (matching today's
"in-memory for the session only" baseline — this is a strict improvement,
never a regression). Any screen reading `useSheetsStore` may show this as
a small non-blocking mono-caption banner; it is never a hard error/crash
state. This is an addition I made during the coverage check, not
something spelled out in the epic text — flagged in §8.

---

## 4. Chord dictionary & resolution (Epic 02) — `src/lib/chords.ts`

### 4.1 Canonical chord-id form

- Root note spelled with **sharps only**, matching `music.ts`'s
  `NOTE_NAMES` (`"C#"`, never `"Db"`). Input with a flat root is accepted
  and normalized to its sharp equivalent; output (from `transposeChordId`)
  is always sharp-spelled. Flagged as **Assumption D** — a flat-spelling
  key signature engine is out of scope for this pass.
- Lookup is case-insensitive on the whole string after `.trim()`
  (dictionary is internally keyed lowercase; e.g. `"Am"`, `"am"`, `" Am "`
  all resolve the same entry).
- Slash-bass chords (`"D/F#"`) are accepted by the parser (root `D`, bass
  `F#`) for `transposeChordId`'s sake, but the dictionary itself is not
  required to carry slash-chord entries in this pass — an unrecognized
  slash chord falls through to the `"unknown"` case like any other miss.

### 4.2 `lookupChordShape` — dictionary + fallback

```ts
export type ChordSource = "dictionary" | "unknown";

export interface ChordShape {
  guitarFrets: string[] | null;  // null only when source === "unknown"
  pianoKeys: string[] | null;    // null only when source === "unknown"
  source: ChordSource;
}

export function lookupChordShape(chordId: string): ChordShape;
```

- Never throws, never returns a "blank-looking" shape for an unknown
  chord — `source: "unknown"` is an explicit, distinct return value the
  frontend must branch on. The required UI treatment (Epic 04, but
  contract fixed here) is the repo's existing not-built-yet convention:
  a mono-caption block, e.g. `"CHORD NOT RECOGNIZED"` — reusing the
  pattern `Placeholder.tsx` already established, per `docs/DESIGN.md`'s
  own instruction to reuse "the mono caption + 2px-ruled block pattern"
  for undrawn states.
- Minimum required dictionary coverage for this pass (exact shapes fixed
  below so 02 and the eventual viewer don't disagree on values for the
  chords already in the seed sheet):
  - **Power chords** (movable root-fifth-octave shape): `E5, G5, A5, D5`
    at minimum (the reference sample's chord set) — implement via a
    movable-shape formula if convenient (root fret position → frets),
    but the four values below are the fixed acceptance values regardless
    of implementation:
    | chordId | guitarFrets (low→high) | pianoKeys |
    |---|---|---|
    | `E5` | `["0","2","2","x","x","x"]` | `["E3","B3"]` |
    | `G5` | `["3","5","5","x","x","x"]` | `["G3","D4"]` |
    | `A5` | `["x","0","2","2","x","x"]` | `["A3","E4"]` |
    | `D5` | `["x","5","7","7","x","x"]` | `["D3","A3"]` |
  - **Open majors**: `C, D, E, G, A` — fixed values:
    | chordId | guitarFrets | pianoKeys |
    |---|---|---|
    | `C` | `["x","3","2","0","1","0"]` | `["C3","E3","G3"]` |
    | `D` | `["x","x","0","2","3","2"]` | `["D3","F#3","A3"]` |
    | `E` | `["0","2","2","1","0","0"]` | `["E3","G#3","B3"]` |
    | `G` | `["3","2","0","0","0","3"]` | `["G3","B3","D4"]` |
    | `A` | `["x","0","2","2","2","0"]` | `["A3","C#4","E4"]` |
  - **Open minors**: `Am, Dm, Em` — fixed values:
    | chordId | guitarFrets | pianoKeys |
    |---|---|---|
    | `Am` | `["x","0","2","2","1","0"]` | `["A3","C4","E4"]` |
    | `Dm` | `["x","x","0","2","3","1"]` | `["D3","F3","A3"]` |
    | `Em` | `["0","2","2","0","0","0"]` | `["E3","G3","B3"]` |
  - **Open dominant 7ths**: `E7, A7, D7, G7` — fixed values:
    | chordId | guitarFrets | pianoKeys |
    |---|---|---|
    | `E7` | `["0","2","0","1","0","0"]` | `["E3","G#3","B3","D4"]` |
    | `A7` | `["x","0","2","0","2","0"]` | `["A3","C#4","E4","G4"]` |
    | `D7` | `["x","x","0","2","1","2"]` | `["D3","F#3","A3","C4"]` |
    | `G7` | `["3","2","0","0","0","1"]` | `["G3","B3","D4","F4"]` |
  - Anything beyond this list (e.g. `F#5`, `Bm7`, `Cmaj7`) is a
    nice-to-have; backend-engineer may extend the table (or generate the
    remaining 8 power chords procedurally from the movable shape) but is
    not required to for this pass's acceptance criteria — every name not
    yet covered must hit the `"unknown"` path cleanly, not crash.

### 4.3 Override resolution + capo/transpose — `resolveChordDisplay`

This is the function the (future) viewer actually calls per rendered
chord — it composes lookup, per-sheet override, and the sheet's
capo/transpose settings into one answer.

```ts
export type ChordResolvedFrom = "override" | "dictionary" | "unknown";

export interface ResolvedChordDisplay {
  writtenChordId: string;       // exactly as it appears in the sheet's chordPlacements
  lookupChordId: string;        // the id actually used for dictionary lookup (== writtenChordId unless transposed)
  guitarFrets: string[] | null; // display-ready, capo already applied; null only when resolvedFrom === "unknown"
  pianoKeys: string[] | null;   // null only when resolvedFrom === "unknown"
  resolvedFrom: ChordResolvedFrom;
}

export function resolveChordDisplay(
  writtenChordId: string,
  sheet: Pick<Sheet, "chordOverrides" | "capo" | "transposeSemitones">
): ResolvedChordDisplay;
```

Resolution order (fixed, see Assumption B/E for why):

1. **Override wins outright.** If `sheet.chordOverrides` has an entry for
   `writtenChordId`, its `guitarFrets` are passed through `applyCapo(...,
   sheet.capo)` and returned with `resolvedFrom: "override"`. Overrides
   are raw finger positions the sheet's author already chose for that
   label — `transposeSemitones` is **not** re-applied to override data
   (there's no chord name left to reparse), but capo still applies
   because capo is a physical device independent of where the shape data
   came from. `pianoKeys` from the override pass through unchanged.
2. Otherwise, `lookupChordId = transposeChordId(writtenChordId,
   sheet.transposeSemitones)`, then `lookupChordShape(lookupChordId)`.
   - If found: `guitarFrets = applyCapo(shape.guitarFrets, sheet.capo)`,
     `pianoKeys = shape.pianoKeys` unchanged (piano has no capo — see
     4.4), `resolvedFrom: "dictionary"`.
   - If not found: `resolvedFrom: "unknown"`, both fields `null`.

### 4.4 Capo math — the worked example (closes the roadmap's flagged open question)

**Rule: capo shifts *displayed* fret numbers by a flat `+capo` on every
fretted or open string; muted strings stay muted.** This is not an
approximation — it's the physically accurate reading of what a capo does:
a capo at fret N makes the "open" string sound like fret N with no capo,
and every fretted note N frets higher, so displaying `dictionaryFret +
capo` (with `"0" + capo`) tells the player exactly which absolute fret,
counted from the actual nut, to press — no different a shape, just a
higher position on the neck.

```ts
export function applyCapo(frets: string[], capo: number): string[] {
  return frets.map((f) => (f === "x" ? "x" : String(Number(f) + capo)));
}
```

**Fixed acceptance case:** open G major shape with capo 2.

```
input:  guitarFrets = ["3","2","0","0","0","3"]   // G major, dictionary default
capo:   2
output: applyCapo(input, 2) === ["5","4","2","2","2","5"]
```

This must be encoded as an actual unit test (see task T2-4), not just
documentation — it's the case the roadmap explicitly flagged as
ambiguous, and it's cheap to pin down permanently.

`transposeSemitones`, in contrast, changes **which chord is looked up**
(a real pitch-class shift of the chord name), not the numbers on an
already-resolved shape — because unlike capo, transposing to a
differently-shaped chord (e.g. `E5` → `F#5`) is not just "the same shape
higher up the neck" for anything other than movable shapes. See
`transposeChordId` below.

**Fixed acceptance case for transpose:**
`transposeChordId("E5", 2) === "F#5"`.

### 4.5 Piano is transpose-aware but capo-unaware

`pianoKeys` reflect the actual sounding pitch of `lookupChordId` (i.e.
already reflect `transposeSemitones`, since that changed which dictionary
entry was looked up) but are never adjusted for `capo` — a capo is a
guitar-specific concept with no piano equivalent, so `resolveChordDisplay`
passes `pianoKeys` straight through from `lookupChordShape`/the override
with no further math.

### 4.6 `transposeChordId`

```ts
export function transposeChordId(chordId: string, semitones: number): string;
```

- Parses `chordId` into `root` (`[A-G][#b]?`) + `suffix` (everything
  else, e.g. `"5"`, `"m"`, `"maj7"`, `""`) [+ optional `/bass` for
  slash chords, each side parsed the same way].
- Shifts `root` (and `bass`, if present) by `semitones` using
  `NOTE_NAMES`/`noteToMidi`-style modulo-12 math from `music.ts` (reuse,
  don't reimplement), always re-spelling the result with `NOTE_NAMES`
  (sharps only — Assumption D again).
- Reassembles `root + suffix` (and `/bass` if present). `suffix` itself
  is never altered by transpose.
- `semitones === 0` returns the input unchanged (still passes through the
  sharp-respelling normalization, e.g. `"Bb"` in → `"A#"` out even at
  `semitones: 0` — documented, not hidden, behavior; see Assumption D).
- Unparseable input (root isn't `[A-G]`) is returned unchanged rather
  than throwing — `lookupChordShape` will then simply report `"unknown"`
  for it downstream, which is the correct graceful outcome.

---

## 5. Sample payloads

### 5.1 Seed sheet `DEAD AIR ON THE HIGHWAY` (Epic 01, full content)

This is the sample content already approved in `docs/DESIGN.md` §"Sample
content", turned into the exact `Sheet` shape. Frontend mocks the list
screen and (later) the viewer against this literal payload.

```json
{
  "id": "sheet-seed-1",
  "title": "DEAD AIR ON THE HIGHWAY",
  "key": "E",
  "bpm": 96,
  "timeSignature": { "beats": 4, "unit": 4 },
  "capo": 0,
  "transposeSemitones": 0,
  "sections": [
    {
      "id": "sec-verse-1",
      "label": "Verse 1",
      "lines": [
        {
          "lyrics": "Headlights on the county line",
          "chordPlacements": [
            { "charIndex": 0, "chordId": "E5" },
            { "charIndex": 18, "chordId": "G5" }
          ]
        },
        {
          "lyrics": "Amp hum keeping perfect time",
          "chordPlacements": [
            { "charIndex": 0, "chordId": "A5" },
            { "charIndex": 16, "chordId": "D5" }
          ]
        }
      ]
    },
    {
      "id": "sec-chorus-1",
      "label": "Chorus",
      "lines": [
        {
          "lyrics": "Dead air, dead air on the dial",
          "chordPlacements": [
            { "charIndex": 0, "chordId": "D5" },
            { "charIndex": 26, "chordId": "A5" }
          ]
        },
        {
          "lyrics": "Nothing on for a hundred mile",
          "chordPlacements": [
            { "charIndex": 0, "chordId": "E5" },
            { "charIndex": 17, "chordId": "G5" }
          ]
        }
      ]
    }
  ],
  "chordOverrides": [],
  "annotations": [],
  "createdAt": "2026-08-22T00:00:00.000Z",
  "updatedAt": "2026-08-22T00:00:00.000Z"
}
```

### 5.2 `resolveChordDisplay` — dictionary hit

```
resolveChordDisplay("G5", { chordOverrides: [], capo: 0, transposeSemitones: 0 })
→ {
    writtenChordId: "G5",
    lookupChordId: "G5",
    guitarFrets: ["3","5","5","x","x","x"],
    pianoKeys: ["G3","D4"],
    resolvedFrom: "dictionary"
  }
```

### 5.3 `resolveChordDisplay` — override wins, with capo

```
sheet = { chordOverrides: [{ chordId: "G5", guitarFrets: ["x","x","5","5","5","3"], pianoKeys: ["G3","D4"] }], capo: 2, transposeSemitones: 0 }
resolveChordDisplay("G5", sheet)
→ {
    writtenChordId: "G5",
    lookupChordId: "G5",
    guitarFrets: ["x","x","7","7","7","5"],   // override frets + capo 2, "x" untouched
    pianoKeys: ["G3","D4"],
    resolvedFrom: "override"
  }
```

### 5.4 `resolveChordDisplay` — unknown chord (fallback)

```
resolveChordDisplay("Cmaj9", { chordOverrides: [], capo: 0, transposeSemitones: 0 })
→ { writtenChordId: "Cmaj9", lookupChordId: "Cmaj9", guitarFrets: null, pianoKeys: null, resolvedFrom: "unknown" }
```

### 5.5 Import — malformed file

```
importFile({ formatVersion: 1, kind: "sheet", sheet: { title: "X" } })
→ { ok: false, error: { code: "malformed_sheet", message: "Sheet is missing required field \"bpm\".", details: { field: "bpm" } } }
```

### 5.6 Import — success

```
importFile({ formatVersion: 1, kind: "sheet", exportedAt: "2026-08-22T00:00:00.000Z", sheet: <valid Sheet with id "sheet-seed-1"> })
→ { ok: true, importedSheetIds: ["<new-uuid>"], count: 1 }
```
(note: the returned id is a freshly generated uuid, not `"sheet-seed-1"` — see §3.3.)

---

## 6. Sheets navigation contract (Epic 03 → future Epic 04/05)

There is no URL router inside a tool in this app today — Tuner and
Metronome are each a single screen. Sheets is the first tool that needs
internal sub-navigation (list → viewer → editor), so this contract is the
one genuinely new piece of shared state Epic 03 introduces, and it's
fixed here so 04/05 don't have to guess it later.

```ts
// src/lib/store.ts
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
```

- `SheetsMobile`/`SheetsDesktop` (Epic 03) read `screen` and render
  `SheetsList` for `{name:"list"}`; for `"viewer"`/`"editor"` they render
  the existing `Placeholder` component today (e.g. `label="SHEET VIEWER"`
  / `label="NEW SHEET"`), with a small back-to-list control (a mono
  `← SHEETS` button calling `openList()`) — this is the literal
  "placeholder navigation" the epic asks for, and it is fully exercised
  and testable today even though 04/05 don't exist yet.
- Epic 04/05 build against this contract unchanged: they just replace the
  `Placeholder` branches in `SheetsMobile`/`SheetsDesktop` with real
  components keyed off the same `screen` value, and call
  `openViewer`/`openEditor`/`openList` from wherever they need to
  navigate (e.g. "save" in the editor calls `openViewer(newId)`).
- Consistent with this app's existing "state per tool persists across
  tool switches" behavior (`docs/DESIGN.md` "Interactions & behavior"):
  switching to Tuner and back to Sheets does **not** reset `screen` back
  to `"list"` — you land back where you left off, same as a running
  Metronome keeps running in the background. No special reset logic is
  introduced.
- Tapping a sheet row in the list calls `openViewer(sheet.id)`; tapping
  "+ New Sheet" calls `openEditor(null)`. Neither call touches
  `useSheetsStore` — Epic 03 does not create a draft `Sheet` record; that
  is Epic 05's job when the user actually saves.

---

## 7. Pagination / sorting / filtering conventions

- No pagination anywhere in this feature — sheet libraries are
  personal-scale (tens, not thousands), and `useSheetsStore.sheets` is
  the full in-memory array, matching `useSetlistStore`'s existing
  unpaginated convention.
- Default sort: insertion order (array order), same as `useSetlistStore`
  — no sort UI in this pass.
- Search/filter (Epic 03):
  ```ts
  function filterSheets(sheets: Sheet[], query: string): Sheet[]
  ```
  Case-insensitive substring match against `title` **or** `key`
  (`sheet.title.toLowerCase().includes(q) || (sheet.key ?? "").toLowerCase().includes(q)`
  where `q = query.trim().toLowerCase()`). Empty/whitespace-only query
  returns the input unchanged (all sheets, original order). Pure function,
  no store dependency — trivially unit-testable, and safe to call on
  every keystroke (no debounce needed at this data scale).

---

## 8. Non-functional notes

- **Idempotency**: `addSheet`/`updateSheet`/`removeSheet` have the same
  semantics as `useSetlistStore`'s equivalents (no dedupe, no idempotency
  key) — this is a personal local app, not a multi-writer system, so
  double-submission isn't a real risk. `importFile` is *not* idempotent
  by design (§3.3) — importing the same file twice intentionally
  produces two sheets.
- **Latency**: IndexedDB reads/writes are async but small (personal-scale
  data) — no loading spinner is expected on individual
  `addSheet`/`updateSheet`/`removeSheet` calls (the store updates
  in-memory state synchronously and persists in the background); the only
  place a loading state is required is the one-time initial hydration on
  app boot (`hydrated: false`), which the list screen must handle (§3.4,
  and Epic 03's task list below).
- **No third-party/network calls** anywhere in these three epics — no
  rate limits, no upstream failure modes to surface beyond
  `persistenceError`.
- **Data scale assumption**: the "arbitrarily long sheets with nested
  arrays" language in the epic is read as "don't pick localStorage and
  regret it," not as a requirement to virtualize/paginate rendering —
  no such requirement is placed on Epic 03's list screen.

---

## 9. Assumptions (resolved here so 02/03 don't each guess differently)

- **A. `Sheet` is a new, separate store/type from `Song`/`useSetlistStore`,
  not a migration of it.** The epic text says "Extend `Song` → `Sheet`
  type," which reads as "`Sheet` is `Song`'s fields plus these new ones,"
  not "replace `useSetlistStore`'s storage." Keeping them separate means
  the already-shipped Metronome tempo list (`SetlistList.tsx`) has zero
  risk of regression from this feature, at the cost of the two lists
  (setlist tempos vs. sheet titles) being able to drift out of sync (e.g.
  editing a song's bpm in the Metronome tab does not update the
  same-titled sheet's bpm, and vice versa). Given this is a personal
  practice tool, not a shared catalog, that drift is an acceptable
  trade-off for this pass. If the roadmap artifact I couldn't fetch says
  otherwise (i.e. wants one unified list), this is the one assumption
  most worth re-confirming before backend-engineer starts Epic 01.
- **B. `ChordOverride` is keyed and matched by the sheet's *written*
  chord id, resolved before transpose, and capo is still applied on top
  of an override.** (§4.3.) The alternative — re-deriving an override
  under transpose by chord-name substitution — isn't well-defined for
  arbitrary hand-entered finger positions, so overrides are treated as
  "the author's literal answer for this label," with capo (a physical,
  additive concept) still layered on.
- **C. Import always assigns fresh ids and appends; it never overwrites
  by id.** (§3.3.) Chosen so import can never silently clobber existing
  data — the only backup mechanism in this pass has to fail safe, not
  fail destructive.
- **D. Chord names are canonicalized to sharp spelling only (no flats)**,
  matching `music.ts`'s existing `NOTE_NAMES`. A flat-aware
  key-signature speller (deciding when "Bb" should stay "Bb" instead of
  becoming "A#") is real work with no existing precedent in this
  codebase and is out of scope for this pass.
- **E. Capo shifts displayed fret numbers by a flat numeric offset
  (`fret + capo`, open strings included); transpose changes which chord
  name is looked up.** (§4.4.) This was the roadmap's explicitly flagged
  open question — resolved with a worked, tested example rather than left
  for backend-engineer and the future viewer to each independently guess.
- **F. Persistence-failure is a new, non-blocking banner state
  (`persistenceError`), not specified in the original epic text.** (§3.4.)
  Added during the coverage check because "add persistence" implicitly
  raises "what happens when persistence doesn't work," and silently
  losing data with no UI signal is worse than the current
  in-memory-only baseline.
