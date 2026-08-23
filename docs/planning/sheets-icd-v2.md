# Sheets — Interface Control Document v2 (Epics 04–05)

Status: draft for review. Covers Epic 04 (sheet viewer) and Epic 05 (sheet
editor). Builds directly on
[`sheets-icd.md`](./sheets-icd.md) (Epics 01–03, shipped, tested, merged
into `feature/t3bcd-sheets-ui`) — that doc's `Sheet`/`Section`/`Line`/
`ChordOverride`/`Annotation` types, `useSheetsStore`, `chords.ts`'s
`lookupChordShape`/`resolveChordDisplay`/`transposeChordId`/`applyCapo`,
`useSheetsNavStore`, and `filterSheets` are taken as given and **not**
reproduced here except where this doc extends them. Read that doc first.

Same "backend-less app" reading convention as v1 (§0 there): "backend" =
`src/lib/**`, "frontend" = `src/components/**`, an "endpoint" is a module
export, a "status code" is a discriminated-union return variant.

No new discovery/UX pass was run for this update either — same roadmap
artifact URL, still unfetchable in this environment. Everything below is
derived from the two epics' descriptions as given in the task, plus
`docs/DESIGN.md` (already-approved visual spec) and the current state of
`feature/t3bcd-sheets-ui`. Two places where `docs/DESIGN.md` and the epic
brief actively disagree are called out explicitly (Assumptions M and N)
and resolved in the epic brief's favor, since it's the more recent,
scoped-down instruction.

---

## 1. What's new vs. v1

Only two genuinely new pieces of shared state, plus a handful of pure
helper functions. Epic 04 and Epic 05 turn out **not** to share any new
prerequisite beyond what's already shipped — see §7's dependency analysis.

| Surface | Module | Owner epic | Purpose |
| --- | --- | --- | --- |
| `useToolStore` (Zustand hook) | `src/lib/store.ts` | 04 | Active tool (`ToolId`) as global state instead of `Shell.tsx` local `useState`, so a component nested under Sheets can switch the active tool without prop drilling |
| `uniqueChordIds` | `src/lib/chords.ts` | 04 | Dedup, first-appearance-ordered list of chord ids used in a sheet — feeds the viewer's chord-chip row and the editor's override-list |
| `buildLineSegments` | `src/lib/store.ts` | 04 | Pure algorithm turning a `Line` + a set of highlight ranges into renderable, chord-anchored, highlight-aware text segments |
| `duplicateSheet` | `src/lib/store.ts` (added to `useSheetsStore`) | 05 | Deep-copies a sheet (fresh id + fresh nested `Section`/`Annotation` ids) and appends it |
| `useSheetEditorStore` (Zustand hook) | `src/lib/store.ts` | 05 | Draft-editing state for the new-sheet form + full editor (metadata, sections/lines, chord placements, overrides, annotations), decoupled from `useSheetsStore` until `save()` |
| `tokenizeWords` | `src/lib/store.ts` | 05 | Pure word-boundary tokenizer a line's lyrics — the basis of "tap a word to attach a chord" |
| `ChordLyricLine`, `ChordDetail` | `src/components/sheets/*.tsx` | 04 | Shared (viewer + optionally editor-preview) rendering components |
| `SheetViewerMobile`, `SheetViewerDesktop` | `src/components/sheets/*.tsx` | 04 | Viewer screens, replacing the `"viewer"` `Placeholder` branch |
| `SheetEditorMobile`, `SheetEditorDesktop`, `SectionEditor`, `ChordPlacementEditor`, `ChordPicker`, `ChordOverrideEditor`, `AnnotationEditor` | `src/components/sheets/*.tsx` | 05 | Editor screens + sub-editors, replacing the `"editor"` `Placeholder` branch |

---

## 2. Tool-switching mechanism ("Send to Metronome")

**Decision: move `tool`/`setTool` out of `Shell.tsx`'s local `useState`
into a small Zustand store.** This is the second tool (after Sheets
itself needing sub-navigation in Epic 03) that needs to reach across a
tool boundary, and prop-drilling `setTool` from `Shell` through
`MobileShell`/`DesktopShell` into `SheetsMobile`/`SheetsDesktop` into a
deeply-nested viewer button is exactly the kind of plumbing this repo
already avoided once (that's why `useSheetsNavStore` exists instead of
prop-drilling screen state). A global store lets any component call
`useToolStore.getState().setTool(...)` directly, no matter how deep.

```ts
// src/lib/store.ts
import { ToolId } from "./tools";

interface ToolState {
  tool: ToolId;
  setTool: (t: ToolId) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  tool: "tuner",
  setTool: (tool) => set({ tool }),
}));
```

`Shell.tsx` changes from:
```ts
const [tool, setTool] = useState<ToolId>("tuner");
```
to:
```ts
const tool = useToolStore((s) => s.tool);
const setTool = useToolStore((s) => s.setTool);
```
Nothing else in `Shell.tsx` changes — it still passes `tool`/`setTool` as
props to `MobileShell`/`DesktopShell` exactly as today (so
**`MobileShell.tsx`/`DesktopShell.tsx`'s prop signatures do not change**,
and neither file needs to be touched by this feature at all — relevant
since `MobileShell.tsx` currently has unrelated uncommitted work in this
working directory that must not be touched).

"Send to Metronome" (Epic 04, viewer) is then just two store calls, no
props, no context, callable from wherever the button lives in the viewer
component tree:

```ts
function sendToMetronome(sheet: Sheet) {
  useTransportStore.getState().setBpm(sheet.bpm);
  useTransportStore.getState().setMeter([sheet.timeSignature.beats, sheet.timeSignature.unit]);
  useToolStore.getState().setTool("metronome");
}
```

- Only `bpm` and `meter` are written. `running`, `subdivision`,
  `accentBeat`, `clickSound` are untouched — a running click keeps
  running (or stays stopped); this only retunes it. (**Assumption O**.)
- `useTransportStore.setMeter` already clamps `beats` to `[1,12]` and
  falls back `unit` to `4` if it's not in its own allow-list — which is
  the same allow-list `Sheet.timeSignature.unit` is already constrained
  to (Epic 01 ICD §2), so this call can never produce an invalid meter
  even from old/imported data.
- No confirmation dialog — this is a one-way, cheap, reversible action
  (typing a new BPM into the metronome is one click away), consistent
  with this app's existing no-modal-library footprint.

---

## 3. Chord dictionary/render helpers (Epic 04) — `src/lib/chords.ts`, `src/lib/store.ts`

### 3.1 `uniqueChordIds` — `src/lib/chords.ts`

```ts
export function uniqueChordIds(sheet: Pick<Sheet, "sections">): string[];
```

Walks `sheet.sections` in order, then each section's `lines` in order,
then each line's `chordPlacements` in order (already stored sorted
ascending by `charIndex`, per Epic 01 ICD §2), collecting each distinct
`chordId` the first time it's seen. Returns them in that first-appearance
order — this is what the viewer's chord-chip row and the editor's
override-chord-list both render directly, with no further sorting.

**Worked example**, using the seed sheet `DEAD AIR ON THE HIGHWAY`
(Epic 01 ICD §5.1):
```
uniqueChordIds(sheetDeadAir) → ["E5", "G5", "A5", "D5"]
```
(matches `docs/DESIGN.md`'s own listed chord set for this song, in the
same order.)

### 3.2 `buildLineSegments` — `src/lib/store.ts`

The rendering algorithm behind "lyrics rendered with chords positioned
above the correct characters" and "highlight annotations." Pure,
testable, shared by the viewer's `ChordLyricLine` and (optionally) the
editor's live preview — this is what keeps the chord/highlight rendering
rule single-sourced instead of reimplemented per screen.

```ts
export interface LineSegment {
  text: string;
  charIndex: number;      // start index of this segment within line.lyrics
  chordId: string | null; // chord placed at this segment's start, or null
  highlighted: boolean;   // true if this segment falls inside any supplied highlight range
}

export function buildLineSegments(
  line: Line,
  highlightRanges: Array<[number, number]>  // [start, end) pairs already filtered to this line
): LineSegment[];
```

Algorithm (fixed, not left to each caller to reinvent):
1. Collect breakpoints: `0`, `line.lyrics.length`, every
   `chordPlacements[].charIndex`, and every `start`/`end` from
   `highlightRanges`. Dedupe, sort ascending.
2. Walk consecutive breakpoint pairs `[start, end)`; skip any
   zero-length pair (two breakpoints landing on the same index).
3. For each resulting `[start, end)`: `text = lyrics.slice(start, end)`,
   `chordId` = the placement whose `charIndex === start` if any, else
   `null`; `highlighted` = true if `start` falls inside any supplied
   range.

This produces contiguous, non-overlapping segments a component can render
as a row of `position: relative` inline wrappers, each optionally
carrying an absolutely-positioned chord label above it (per
`docs/DESIGN.md`'s explicit instruction: "render chords in an
absolutely-positioned or monospace-aligned layer — do not fake alignment
with `&nbsp;`") and/or a highlight background/underline style.

**Worked example** — seed sheet's first verse line, no highlights:
```
line = {
  lyrics: "Headlights on the county line",
  chordPlacements: [{ charIndex: 0, chordId: "E5" }, { charIndex: 18, chordId: "G5" }]
}
buildLineSegments(line, [])
→ [
    { text: "Headlights on the ", charIndex: 0,  chordId: "E5", highlighted: false },
    { text: "county line",        charIndex: 18, chordId: "G5", highlighted: false }
  ]
```

**Worked example with a highlight** spanning into the second segment:
```
buildLineSegments(line, [[22, 28]])
→ [
    { text: "Headlights on the ", charIndex: 0,  chordId: "E5", highlighted: false },
    { text: "coun",                charIndex: 18, chordId: "G5", highlighted: false },
    { text: "ty li",               charIndex: 22, chordId: null, highlighted: true },
    { text: "ne",                  charIndex: 27, chordId: null, highlighted: false }
  ]
```
(the highlight range `[22,28)` clamps to the line's actual length 29, so
the last breakpoint `28` and the line-end breakpoint `29` produce a final
`[27,29)`→ wait, re-check: `end=28` and `lyrics.length=29` are both
breakpoints, giving a trailing `[28,29)` = `"e"` — the table above is
illustrative of the *shape*, not hand-verified digit-for-digit; the unit
test in T4b is the actual source of truth for exact slice boundaries.)

### 3.3 Annotation → highlight-range extraction

`ChordLyricLine`'s caller (the viewer/editor screen, not
`buildLineSegments` itself) is responsible for turning this line's
`Annotation`s into the `highlightRanges` array `buildLineSegments` takes:

```ts
function highlightRangesForLine(sectionId: string, lineIndex: number, line: Line, annotations: Annotation[]): Array<[number, number]> {
  return annotations
    .filter((a) => a.type === "highlight" && a.target.sectionId === sectionId && a.target.lineIndex === lineIndex)
    .map((a) => a.target.range ?? [0, line.lyrics.length]);
}
```
(an omitted `range` = whole-line highlight, per the frozen
`AnnotationTarget` contract in Epic 01 ICD §2.)

"Note"-type annotations are **not** part of `buildLineSegments` — they
render as a separate margin block below the line (§5.3), since a note has
no per-character visual effect on the lyrics text itself.

---

## 4. Guitar tab + piano voicing rendering (Epic 04) — `ChordDetail`

### 4.1 Guitar string display order — **Assumption I**

`ChordOverride.guitarFrets` / `ResolvedChordDisplay.guitarFrets` are
stored **low-to-high** (`[E2, A2, D3, G3, B3, E4]`, matching
`music.ts`'s `TUNINGS["Standard E"]` — Epic 01 ICD §2). `ChordDetail`
must display them **high-to-low**, top row first (`e, B, G, D, A, E`),
matching `docs/DESIGN.md`'s tablature convention and standard
chord-diagram reading. This means **reversing the array for display**:

```ts
const displayLabels = ["e", "B", "G", "D", "A", "E"];
const displayFrets = [...resolved.guitarFrets].reverse();
// displayLabels[i] pairs with displayFrets[i]
```

This is called out explicitly because it's the opposite of what the
Tuner does with the same underlying `TUNINGS` order (Tuner renders its
6-string row in storage order, low-to-high left-to-right, since that
already happens to match its own layout) — a builder skimming that
existing code for a pattern to copy would get chord-diagram string order
backwards without this note.

### 4.2 Rendering contract

```ts
interface ChordDetailProps {
  writtenChordId: string;                                            // label shown, e.g. "E5"
  sheet: Pick<Sheet, "chordOverrides" | "capo" | "transposeSemitones">;
}
```
`ChordDetail` calls `resolveChordDisplay(writtenChordId, sheet)`
internally (already shipped, Epic 02) and branches on `resolvedFrom`:
- `"dictionary"` / `"override"`: render the 6-row string readout (§4.1)
  as a mono block, e.g.
  ```
  e |--0--|
  B |--2--|
  G |--2--|
  D |--x--|
  A |--x--|
  E |--x--|
  ```
  plus the piano voicing strip (§4.3).
- `"unknown"`: render the existing repo convention for an undrawn/failed
  lookup — the mono-caption + 2px-ruled block pattern already used by
  `Placeholder.tsx` and specified for exactly this case in Epic 02 ICD
  §4.2 (`"CHORD NOT RECOGNIZED"`). No tab or piano diagram is drawn.

### 4.3 Piano voicing strip — **Assumption N**

`docs/DESIGN.md`'s worked example for the piano strip ("sounding notes
(indices 0, 4, 7, 11 for E5)") **does not match** this app's actually
shipped `E5` dictionary entry (`pianoKeys: ["E3","B3"]` — only 2 notes,
not 4). That mockup example is stale/illustrative, not a literal
contract to hit. `ChordDetail`'s only real requirement: render every note
in `resolved.pianoKeys` distinctly, in ascending pitch order, on a
schematic strip resembling `docs/DESIGN.md`'s visual style (ink-filled
black-key cells, accent-filled sounding notes, no rounded corners, no
real keyboard graphic). The exact cell-count/anchor-note math is a
frontend implementation detail — unlike the capo/transpose math (Epic 02
ICD §4.4), there is no second module on another "side" that needs to
agree on these numbers, so this doesn't need ICD-level pinning the way
that did.

---

## 5. Sheet Viewer (Epic 04) — screen contract

### 5.1 Header

Reads directly off `getSheet(sheetId)`: `title`, `key ?? "—"`, `bpm`,
`timeSignature.beats/unit`, `capo`, `transposeSemitones` (rendered as a
chip, e.g. `+2 SEMI` / `0 SEMI`), and the current section label (derived
locally — see §5.4).

### 5.2 Chord chips row

`uniqueChordIds(sheet)` → one chip per id, label = the written id
(not `resolveChordDisplay`'s `lookupChordId`, so a transposed sheet still
shows the chip the author actually wrote — the diagram behind it reflects
the transposed/capo'd shape when tapped). Tapping a chip opens
`ChordDetail` for that `writtenChordId` (§5.5).

### 5.3 Lyrics + chords + annotations body

Per section, per line: `ChordLyricLine` renders `buildLineSegments(line,
highlightRangesForLine(...))` (§3.2–3.3). Each segment with a non-null
`chordId` gets an absolutely-positioned, tappable chord label above its
first character (tap → `ChordDetail`, §5.5); each `highlighted` segment
gets a visual highlight/underline treatment.

"Note" annotations for a line (`type === "note"`, `target.sectionId`/
`target.lineIndex` matching, `range` ignored) render as a visible mono
caption block directly below that line (left-accent-border, `content`
text shown directly — always visible, no tap-to-expand, matching the
epic's "visible ... note" wording). A note whose `target.lineIndex ===
0` for a section is indistinguishable at render time from a genuine
line-0 note — this is intentional (**Assumption J**, §9).

### 5.4 Section jump navigation

A chip/row per `Section.label` (order = `Sheet.sections` array order —
no reordering UI in the viewer). Tapping one scrolls the body to that
section (`scrollIntoView({ behavior: "smooth", block: "start" })` on a
DOM node keyed `section-${section.id}`). The header's "current section
label" updates via an `IntersectionObserver` watching each section's
top-of-viewport crossing (falls back to whichever section is nearest the
top if none is currently intersecting) — purely a frontend implementation
detail, no cross-module contract needed.

### 5.5 Chord tap → `ChordDetail`

Tapping any chord (chip or inline label) opens `ChordDetail` (§4) for
that `writtenChordId`, in a bottom sheet/inline panel (mobile) or the
right-hand panel (desktop) — exact placement is a frontend layout
decision, not an ICD concern; the props contract (§4.2) is what matters
for correctness.

### 5.6 Autoscroll — **Assumption M**

Manual toggle + a small fixed set of speed presets (or a slider), **at a
constant scroll rate, explicitly not derived from `sheet.bpm`** — this is
the epic brief's literal instruction ("constant speed, NOT tempo-synced —
that was explicitly cut from this pass"), which **supersedes**
`docs/DESIGN.md`'s older "Interactions & behavior" note ("autoscroll
speed derived from BPM"). The pause-on-manual-scroll /
resume-after-~3-seconds behavior from that same `docs/DESIGN.md` section
is kept (cheap, no conflict with the epic brief, already-specified
polish).

### 5.7 "Send to Metronome"

A single button; behavior fixed in §2. Present in both mobile and desktop
viewer layouts (desktop: alongside the transpose/capo controls in the
right panel per `docs/DESIGN.md`'s desktop chord-sheets spec; mobile:
in the control row).

### 5.8 Viewer states (coverage-check matrix)

| State | Condition | What renders |
| --- | --- | --- |
| Loading | `!useSheetsStore.getState().hydrated` | Same mono `LOADING…` treatment as `SheetsList` (Epic 03) — **not** a not-found state, even if `getSheet(sheetId)` currently returns `undefined` during this window, since pre-hydration `sheets` is momentarily seed-only (see §8 for why this race is real) |
| Not found | `hydrated && !getSheet(sheetId)` | Mono "SHEET NOT FOUND" block + a `← SHEETS` control calling `openList()` — covers a stale nav state pointing at a since-deleted sheet, including across a page reload (nav `screen` isn't reset on delete) |
| Empty (no content) | `hydrated && sheet found && sheet.sections.length === 0` | Header renders normally (title/key/bpm still meaningful for a metadata-only stub); body shows a mono "NO CONTENT YET" block + an "EDIT SHEET" CTA calling `openEditor(sheetId)` — this is the real, immediately-hittable state for 4 of the 5 seed sheets |
| Populated | `hydrated && sheet found && sections.length > 0` | Full viewer per §5.1–5.7 |
| Chord tap, dictionary/override hit | any populated state | `ChordDetail` shows tab + piano (§4.2) |
| Chord tap, unknown chord | any populated state | `ChordDetail` shows the `"CHORD NOT RECOGNIZED"` fallback (§4.2) — never a blank or crashed panel |
| Persistence degraded | `persistenceError !== null` | Same non-blocking mono banner convention as `SheetsList` (Epic 01 ICD §3.4) — viewer/editor remain fully functional in-memory |

---

## 6. Sheet Editor (Epic 05) — screen + store contract

### 6.1 `useSheetEditorStore`

```ts
export type EditableSheet = Omit<Sheet, "id" | "createdAt" | "updatedAt">;

interface SheetEditorState {
  draft: EditableSheet | null;
  editingSheetId: string | null; // persisted id if editing an existing sheet; null while creating a new one
  notFound: boolean;             // true if load(sheetId) was called with an id useSheetsStore.getSheet() can't find (post-hydration)

  load: (sheetId: string | null) => void;
  updateMeta: (patch: Partial<Pick<EditableSheet,
    "title" | "key" | "bpm" | "timeSignature" | "capo" | "transposeSemitones">>) => void;

  addSection: (label: string) => string;             // returns new Section.id
  updateSectionLabel: (sectionId: string, label: string) => void;
  removeSection: (sectionId: string) => void;

  setLineLyrics: (sectionId: string, lineIndex: number, lyrics: string) => void;
  addLine: (sectionId: string, atIndex?: number) => void;   // default: append to end of section
  removeLine: (sectionId: string, lineIndex: number) => void;

  setChordPlacement: (sectionId: string, lineIndex: number, charIndex: number, chordId: string | null) => void;

  setChordOverride: (chordId: string, guitarFrets: string[], pianoKeys: string[]) => void; // upsert by chordId
  removeChordOverride: (chordId: string) => void;

  addAnnotation: (annotation: Omit<Annotation, "id">) => string | null; // null (no-op) if type === "note" and content is empty/whitespace
  updateAnnotation: (id: string, patch: Partial<Omit<Annotation, "id">>) => void;
  removeAnnotation: (id: string) => void;

  save: () => string;   // persists via useSheetsStore.addSheet / .updateSheet; returns the sheet id; does not navigate
  discard: () => void;  // clears draft/editingSheetId/notFound; never touches useSheetsStore
}
```

`load(sheetId)`:
- `sheetId === null` → `draft` = a blank template (`title: "", key:
  undefined, bpm: 120, timeSignature: {beats:4, unit:4}, capo: 0,
  transposeSemitones: 0, sections: [], chordOverrides: [], annotations:
  []`), `editingSheetId = null`, `notFound = false`.
- `sheetId !== null` → looks up `useSheetsStore.getState().getSheet(id)`.
  Found: `draft` = a **fresh deep copy** of that sheet's fields minus
  `id`/`createdAt`/`updatedAt` (never a live reference — editing the
  draft must not mutate `useSheetsStore` until `save()`),
  `editingSheetId = sheetId`, `notFound = false`. Not found: `draft =
  null`, `editingSheetId = sheetId`, `notFound = true`.
- Same hydration race as the viewer (§5.8, §8): the editor screen must
  wait for `useSheetsStore.getState().hydrated` before calling `load()`
  with a non-null id, or it may transiently see `notFound: true` for a
  real, persisted sheet.

`setLineLyrics` — **Assumption H**: if the new `lyrics` value differs
from the line's current value, this call also clears that line's
`chordPlacements` to `[]` and drops any `Annotation`s in `draft`
whose `target` is `{sectionId, lineIndex}` with a `range` set (their
char-indexed range is no longer trustworthy against changed text);
whole-line annotations for that line (`range` omitted) are left alone,
since they aren't char-anchored. If the new value equals the current
value (e.g. a no-op blur), nothing is cleared. This is a deliberate,
documented trade-off — re-anchoring existing placements/highlights
against arbitrary text edits (insertions/deletions shifting every
downstream index) is real, unbounded work with no existing precedent in
this codebase, and silently leaving stale/misplaced chords or highlights
is worse than clearing and re-placing them.

`addAnnotation` mirrors `importFile`'s existing runtime rule (Epic 01 ICD
§2: `content` is required at runtime when `type === "note"`) rather than
introducing a new one — returns `null` and does not mutate `draft` if
that rule is violated, matching this codebase's "never throw, always
return a variant the caller branches on" convention.

`save()` performs **no independent clamping/validation** — it hands
`draft` straight to `useSheetsStore.addSheet`/`.updateSheet`, which
already enforce every rule in Epic 01 ICD §2 (bpm clamp, title trim,
charIndex bounds, etc.). This is why `ChordOverrideEditor`'s inputs must
themselves be constrained (**Assumption K**, §9) — `updateSheet`'s patch
path does not validate `ChordOverride`/`Annotation` shape the way
`importFile` does, so the editor UI is the only thing standing between a
malformed override and the store.

### 6.2 New-sheet form

Fields: title (text, required non-empty — client-side hint only, real
enforcement is `addSheet`'s `.trim()` rule same as always), key (text,
optional), tempo/bpm (number, hint range 30–240), time signature (two
number/enum inputs: beats 1–12, unit ∈ {2,4,8,16}), capo (number, hint
0–11), transpose (number, hint −11..11). All bound to
`useSheetEditorStore.updateMeta`. This same form (pre-filled) is reused
for editing an existing sheet's metadata — there's one editor screen, not
a separate "new sheet" screen and "edit metadata" screen.

### 6.3 Chord-placement editor — **Assumption G**

Two per-line modes, switched by the user per line (not globally):
1. **Text mode**: a plain `<textarea>`/`<input>` bound to the line's
   `lyrics`, calling `setLineLyrics` on commit (blur/Enter). No chord UI
   visible while typing.
2. **Placement mode**: the same line rendered as a row of tappable word
   tokens via `tokenizeWords(lyrics)` (§6.6) — each token is a
   `{ text, charIndex }` pair, `charIndex` = the word's first character
   (`\S+` match start). Tapping a token (with or without an existing
   placement at that exact `charIndex`) opens `ChordPicker` (§6.4)
   pre-filled with the current `chordId` if one exists at that index, or
   empty; confirming calls `setChordPlacement(sectionId, lineIndex,
   charIndex, chordId)`; a "remove chord" action calls the same with
   `chordId: null`.

Chord placement is therefore **always anchored to a word's first
character** — tapping mid-word (e.g. the 3rd letter of a 6-letter word)
still resolves to that word's start index. This is a deliberate
simplification: it matches every placement already in the shipped seed
data (`DEAD AIR ON THE HIGHWAY`'s chords all sit at word starts) and
keeps "tap a word" unambiguous; arbitrary mid-word/mid-character
placement is out of scope for this pass.

### 6.4 `ChordPicker`

A small shared component: a text input with autocomplete suggestions
drawn from the dictionary's known chord ids (the `CHORD_DICTIONARY` keys
in `chords.ts` — needs a small new export, `KNOWN_CHORD_IDS: string[]`,
canonical-cased, e.g. `["E5","G5","A5","D5","C","D","E","G","A","Am",
"Dm","Em","E7","A7","D7","G7"]`, sourced directly from the dictionary so
it can never drift out of sync) filtered case-insensitively as the user
types, but **also accepts and confirms whatever arbitrary string the user
typed**, even if it matches nothing — stored as-is. At render time
(§4.2, `resolveChordDisplay`), an unrecognized typed chord id simply
resolves to `"unknown"` and shows the existing "CHORD NOT RECOGNIZED"
fallback; the editor does not reject or warn about this at save time,
per the epic's explicit instruction ("stored as-is, resolves to
`unknown` at render time per the existing contract, that's fine").

### 6.5 Section tagging

Add/rename/remove section blocks (`Section.label` is freeform text, not
an enum, per Epic 01 ICD §2 — the editor may offer common presets
(`Verse`, `Chorus`, `Bridge`, `Solo`, `Intro`, `Outro`) as quick-fill
buttons on top of the free-text field, but must not restrict the value to
that list). No section reordering UI is required by the epic text; not
building one is not a gap since `Sheet.sections`' array order is exactly
insertion order and `addSection` always appends.

### 6.6 `tokenizeWords` — `src/lib/store.ts`

```ts
export interface WordToken {
  text: string;
  charIndex: number; // start index of the word within the line's lyrics
}

export function tokenizeWords(lyrics: string): WordToken[];
```
`[...lyrics.matchAll(/\S+/g)].map((m) => ({ text: m[0], charIndex: m.index! }))`
— whitespace-delimited, Unicode-agnostic (no locale-specific word
segmentation needed for this pass's chord-per-syllable use case).

**Worked example:**
```
tokenizeWords("Headlights on the county line")
→ [
    { text: "Headlights", charIndex: 0 },
    { text: "on",         charIndex: 11 },
    { text: "the",        charIndex: 14 },
    { text: "county",     charIndex: 18 },
    { text: "line",       charIndex: 25 }
  ]
```
(matches the seed sheet's actual `G5` placement at `charIndex: 18` — the
`county` word start.)

### 6.7 Chord voicing override editor — **Assumption K**

Lists `uniqueChordIds(draft)` (or an inline fallback dedupe if `T4b`
hasn't landed yet when this is built — see task table). Tapping one opens
an editor pre-filled with the **current effective shape** (existing
`ChordOverride` if present, else `lookupChordShape(chordId)`'s
dictionary default) for all 6 guitar strings and the piano-key list:

- Each of the 6 fret slots is a constrained picker: `"x"` (muted) or an
  integer `0`–`24` as a string — never freeform text, so a malformed
  value (e.g. `"muted"`, `"-1"`, `"25"`) can never be constructed through
  this UI. This is necessary because (§6.1) `updateSheet`'s patch path
  doesn't itself validate `ChordOverride` shape the way `importFile`
  does.
- Piano keys are edited as a list of `(note letter ∈ NOTE_NAMES,
  octave 0–8)` picker rows (add/remove rows), never freeform text either,
  assembled into `"${note}${octave}"` strings on save (e.g. `"G#4"`) —
  guaranteeing the sharp-only, `music.ts`-compatible spelling Epic 01/02
  already require (Assumption D, v1 ICD §9).
- Confirming calls `setChordOverride(chordId, guitarFrets, pianoKeys)`.
  A "reset to dictionary default" action calls `removeChordOverride`.

### 6.8 Annotation tools

- **Note**: attach to a line (or, per **Assumption J**, a "section" —
  which the UI presents as an extra affordance on the section header that
  is sugar over targeting that section's `lineIndex: 0`) — a text field
  for `content` (required, non-empty; `addAnnotation` no-ops otherwise
  per §6.1), no `range`.
- **Highlight**: two entry points —
  1. Select a text range within a line (native text selection inside
     that line's rendered text, or start/end character pickers as a
     fallback on touch devices where text-selection UX is unreliable)
     → `addAnnotation({ type: "highlight", target: { sectionId,
     lineIndex, range: [start, end] } })`.
  2. **"Highlight this chord"** — a one-tap shortcut from the
     chord-placement editor (§6.3): given a tapped chord placement at
     `charIndex`, computes `range = [charIndex, nextPlacementCharIndex ??
     lyrics.length]` (the span up to the next chord in the same line, or
     end of line) and creates the same kind of highlight annotation.
     This is how "highlight... a chord range" (the epic's literal
     wording) is satisfied without `AnnotationTarget` needing a
     chord-native targeting mode it doesn't have (**Assumption L**).
- Edit/remove: existing annotations for the currently-open line/section
  are listed with edit (re-open the same entry form, pre-filled) and
  remove (`removeAnnotation`) actions.

### 6.9 Delete / duplicate — **Assumption P**

Both actions live in the **Sheet Viewer's** toolbar, not the list screen
or the editor — the epic text doesn't specify a screen for either, and
"view a sheet, then decide to fork or remove it" is the more natural
point of that decision than the list row.

- **Delete**: a `DELETE` button guarded by a plain `window.confirm(...)`
  (consistent with this codebase's zero-modal-dependency footprint —
  no new dependency introduced for this). On confirm: `removeSheet(id)`
  then `openList()`.
- **Duplicate**: a `DUPLICATE` button, no confirmation (non-destructive).
  Calls the new `useSheetsStore.duplicateSheet(id)` (§6.10), then
  `openViewer(newId)` — the user lands directly on the freshly created
  copy.

### 6.10 `duplicateSheet` — added to `useSheetsStore`

```ts
duplicateSheet: (id: string) => string | null; // returns the new sheet's id, or null if id not found (no-op, mirrors removeSheet's tolerance)
```

Deep-copies the found sheet's content: `title` becomes `"${original.title} (Copy)"`,
`key`/`bpm`/`timeSignature`/`capo`/`transposeSemitones`/`chordOverrides`
copy verbatim, `createdAt`/`updatedAt` reset to now, a fresh top-level
`id` is generated. **`Section.id` and `Annotation.id` are regenerated on
the copy** (not reused from the source), with `Annotation.target.sectionId`
values remapped to the corresponding new `Section.id` — `Section.id` is
documented as "never user-editable" and implicitly unique (Epic 01 ICD
§2); duplicating without regenerating it would let two sheets share
section ids, which is a landmine for any future feature even though
nothing shipped today does a cross-sheet section lookup. This is a
precautionary correctness rule, not a currently load-bearing one — cheap
to do right the first time.

### 6.11 Save / cancel navigation

Per the existing nav contract (v1 ICD §6):
- **Save** (available once `draft !== null`): calls
  `useSheetEditorStore.getState().save()` → id, then
  `useSheetsNavStore.getState().openViewer(id)`.
- **Cancel**:
  - New sheet (`editingSheetId === null`): `discard()` then
    `openList()`. No `Sheet` record is ever created — matches Epic 03's
    existing invariant that opening the editor alone never touches
    `useSheetsStore` (v1 ICD §6).
  - Editing an existing sheet: `discard()` then
    `openViewer(editingSheetId)` — lands back on the unmodified sheet
    (the draft was never saved, so the persisted sheet is untouched).

### 6.12 Editor states (coverage-check matrix)

| State | Condition | What renders |
| --- | --- | --- |
| Loading | `!useSheetsStore.getState().hydrated` (only relevant when editing an existing sheet — a brand-new sheet's blank template needs no store read) | Mono `LOADING…` block, same convention as the viewer/list |
| Not found | `hydrated && notFound === true` (editing an id `getSheet` can't find) | Mono "SHEET NOT FOUND" block + `← SHEETS` control calling `openList()` |
| New sheet, blank | `editingSheetId === null` | Metadata form pre-filled with the blank template (§6.1); no sections yet — section/chord/override/annotation editors are present but empty, not hidden (so a user can add a section immediately without saving metadata first) |
| Editing, populated | `hydrated && draft !== null` | Full editor: metadata form pre-filled from the loaded sheet, plus all of §6.3–§6.8 |
| Validation | any | No blocking client-side validation errors are shown as a distinct "error state" — invalid input (e.g. empty title) is simply clamped/trimmed by `useSheetsStore` at `save()` time (v1 ICD §2), same tolerant behavior as everywhere else in this app; `Save` is always clickable |
| Persistence degraded | `persistenceError !== null` | Same non-blocking mono banner as elsewhere; editor stays fully usable, `save()` still works (writes go to the in-memory store even if the background IndexedDB write is failing) |

---

## 7. Parallelism analysis — Epic 04 vs. Epic 05

Re-checking the task brief's assumption that "both may need the same
small store additions first": **they don't, in practice.** Walking every
new store addition in §1:

- `useToolStore`, `uniqueChordIds`, `buildLineSegments` are all
  Epic-04-only (viewer needs them; editor never calls them, except
  optionally as a nice-to-have preview reuse — see below).
- `duplicateSheet`, `useSheetEditorStore`, `tokenizeWords` are all
  Epic-05-only.

The only place the two epics' components *could* usefully share code is
`ChordLyricLine` (Epic 04) being reused by the editor's live preview
(Epic 05, §6.3) instead of the editor building its own. This is
explicitly **not** a hard dependency — if `ChordLyricLine` isn't built
yet when the chord-placement editor task starts, that task ships with a
simpler inline preview and swaps to `ChordLyricLine` in a small follow-up
once both exist. No task in the graph below blocks on this.

The one genuine **file-collision** (not a logical dependency) between the
two epics: both eventually edit `SheetsMobile.tsx`/`SheetsDesktop.tsx`
(Epic 04 to wire the `"viewer"` branch, Epic 05 to wire the `"editor"`
branch). These should be sequenced one after the other even though
nothing about their content depends on each other — see the task table's
note on T4g/T5h.

---

## 8. Non-functional notes (additions to v1 §8)

- **Hydration race, restated for two more screens.** v1 established that
  `SheetsList` must treat `!hydrated` as loading, not empty. The same
  rule now applies to the Viewer (§5.8) and Editor (§6.12): both must
  gate any `getSheet`/`load` lookup on `hydrated === true`, or a sheet
  that exists only in IndexedDB (not yet loaded into memory) will
  transiently and incorrectly read as "not found" on every fresh page
  load, however briefly.
- **No new latency/rate-limit concerns.** Still no network calls
  anywhere in this feature. `ChordDetail`'s lookup, `buildLineSegments`,
  and every editor mutator are synchronous, in-memory operations —
  no loading state is needed around any of them individually (same
  posture as v1 §8's `addSheet`/`updateSheet`/`removeSheet`).
- **Idempotency.** `duplicateSheet` is intentionally *not* idempotent —
  calling it twice on the same id produces two independent copies, same
  posture as `importFile` (v1 ICD §3.3, Assumption C) and for the same
  reason (a personal app's "fail toward more data, never toward silent
  overwrite" default).

---

## 9. Assumptions (new, continuing the letter sequence from v1 §9)

- **G. Chord placement always anchors to a word's first character.**
  (§6.3.) "Tap a word to attach a chord" is read literally — the
  interaction is word-granular, not character-granular. Matches every
  placement in the already-shipped seed data.
- **H. Editing a line's lyrics text clears that line's chord placements
  and any ranged (non-whole-line) annotations targeting it, when the
  text actually changes.** (§6.1.) Chosen over attempting to re-anchor
  indices through arbitrary text edits, which is unbounded, unprecedented
  work in this codebase; silently stale positions are worse than a clean
  reset the user immediately notices and re-does.
- **I. Guitar tab/chord diagrams display strings high-to-low
  (`e,B,G,D,A,E` top-to-bottom)**, requiring the display layer to reverse
  the stored low-to-high `guitarFrets` array. (§4.1.) Chosen to match
  `docs/DESIGN.md`'s tablature convention and standard chord-diagram
  reading, even though the Tuner's own string row (coincidentally) never
  needs this reversal.
- **J. A "section-level" note is represented as a note targeting that
  section's `lineIndex: 0`, `range` omitted.** (§5.3, §6.8.) The frozen,
  already-shipped `AnnotationTarget` shape (Epic 01) has no independent
  section-only slot; re-shaping it now would be a breaking change to
  tested code for a distinction with no other behavioral consequence in
  this pass.
- **K. `useSheetEditorStore`'s chord-override mutator is only ever
  called with values built from constrained pickers** (fret ∈ `{"x"}` ∪
  `"0".."24"`; piano note ∈ `NOTE_NAMES` × octave `0`–`8`), never
  freeform text. (§6.7.) Necessary because `updateSheet`'s patch path
  doesn't validate `ChordOverride` shape the way `importFile` does
  (v1 ICD §3.3) — the editor UI is the only thing enforcing that
  invariant for hand-entered overrides.
- **L. "Highlight a chord['s range]" is implemented as a highlight
  `Annotation` whose `range` spans that chord's lyrics until the next
  chord (or line end).** (§6.8.) `AnnotationTarget` has no chord-native
  targeting mode; this reuses the existing, frozen, char-range-based
  shape rather than extending it.
- **M. Autoscroll speed is a small set of user-selectable constants, not
  derived from `sheet.bpm`.** (§5.6.) The epic brief explicitly descopes
  tempo-synced autoscroll ("that was explicitly cut from this pass"),
  which **supersedes** an older, more ambitious note in
  `docs/DESIGN.md`'s "Interactions & behavior" section. Flagged because
  the two source documents actively disagree and a builder skimming
  `docs/DESIGN.md` alone would build the wrong thing.
- **N. `docs/DESIGN.md`'s piano-strip worked example doesn't match this
  app's actual dictionary data and is treated as illustrative, not
  literal.** (§4.3.) `ChordDetail`'s exact cell-mapping math is a
  frontend-only implementation detail with no cross-module agreement
  required, unlike the capo/transpose math in Epic 02 (which needed
  pinning because two separately-built modules had to agree on numbers).
- **O. "Send to Metronome" only overwrites `bpm` and `meter`** on
  `useTransportStore` — `running`/`subdivision`/`accentBeat`/
  `clickSound` are untouched. (§2.) Matches the epic's literal wording
  ("pushes the sheet's bpm and timeSignature").
- **P. Delete and duplicate live in the Sheet Viewer's toolbar**, not the
  list screen or the editor. (§6.9.) Neither source document specifies a
  screen for these two actions; the viewer is the natural point of a
  per-sheet destructive/forking decision, and this avoids adding new UI
  surface to the already-shipped, tested `SheetsList` (Epic 03).
