# Handoff: RIFF — musician practice PWA

## Overview
RIFF is a tuner-first progressive web app for bedroom songwriters and self-teaching players. Five tools share one shell: **Tuner, Metronome, Chord sheets (with guitar tablature + piano voicing), Loop station, Beat maker**. Two form factors are designed: a 390 × 800 mobile app (bottom tab bar) and a 1240 × 760 desktop "practice desk" (left tool rail + main pane + right context panel).

## About the design files
`RIFF - Musician PWA.dc.html` is a **design reference created in HTML** — a prototype showing intended look and layout, not production code to copy. Open it in a browser to inspect any screen. `modernist.css` is the design-token stylesheet (all `var(--*)` values below resolve from it) and is the one file worth porting more or less directly. `support.js` is only the runtime that renders the prototype — ignore it.

The task is to **recreate these screens in the target codebase's own environment** (React/Vue/Svelte + Web Audio API, or a native shell) using its established patterns. If no codebase exists yet: React + Vite + TypeScript, Web Audio API for all timing/audio, a service worker + manifest for PWA install/offline.

## Fidelity
**High-fidelity.** Colors, type, spacing, and rules are final. Recreate pixel-close. Everything is inline-styled in the prototype for streaming reasons — in production, extract to your component/style layer, keeping the tokens.

## Design system — Modernist
Flat, architectural, near-mono. Rules and alignment do all the organizing; nothing floats, nothing is rounded.

Hard rules to respect:
- **No rounded corners anywhere.** All radii are 0.
- **2px borders/dividers, never hairlines.** `2px solid var(--color-text)` between major regions; `2px solid var(--color-divider)` inside a region.
- **Everything flush left** — headings, copy, and labels inside wide buttons/nav items (a full-width button's label starts at its left padding edge, never centered).
- **Red is used sparingly**: the active nav item, the primary action, the tuner's cent marker, active step/beat cells, and the meter fills. Everything else is ink on ground.
- **No gradients, no shadows** in these screens (the token sheet has `--shadow-*`; these screens don't use them).

### Design tokens (from `modernist.css`)
| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#f3f2f2` | app ground |
| `--color-surface` | `#eae9e9` | alternate fill |
| `--color-text` | `#201e1d` | ink, all borders |
| `--color-accent` | `#ec3013` | active state, primary action, meters |
| `--color-accent-700` | `#ae1800` | accent-colored *text* at body size (chord labels) |
| `--color-accent-400` | `#ff9783` | accent text on dark ground |
| `--color-divider` | `rgba(32,30,29,.4)` | interior 2px rules |
| `--color-neutral-200/300` | `#eae7e7` / `#d7d3d3` | inactive list fills, slider tracks |
| `--color-neutral-400/500` | `#bab6b6` / `#9b9797` | input-level bars, meter ticks |
| `--color-neutral-600/700` | `#7d7979` / `#605d5d` | secondary + mono label text |
| `--radius-*` | `0px` | all |
| `--space-1..8` | 4 / 8 / 12 / 16 / 24 / 32 px | spacing scale |

Type: **Archivo** (400/500/700/800/900) for everything UI; **JetBrains Mono** (400/700) for meta labels, readouts, and tablature. Mono labels are uppercase with `letter-spacing: .12–.16em` at 9–11px. Display numerals use `font-weight: 800`, `letter-spacing: -.05em`, `line-height: .78–.85`.

Icons: none are used. If you add any, use Lucide at 2px stroke.

## Screens

### Shell — mobile (390 × 800)
Vertical flex, `background: var(--color-bg)`, `border: 2px solid var(--color-text)`, `overflow: hidden`.
1. **Status row** — 30px tall, `0 14px`, mono 9px/.14em, `9:41 · RIFF PWA · 100%`, bottom 2px ink rule. (Prototype affordance; in the real PWA this is the OS status bar.)
2. **App header** — `16px 18px`, `RIFF` at Archivo 900/22px/-.03em on the left; right side a tool chip: mono 10px/.14em, `padding: 5px 8px`, ink fill with ground text (`REC ARMED` uses accent fill + white text). Bottom 2px ink rule.
3. **Tool body** (per screen below).
4. **Bottom tab bar** — 5 equal columns, top 2px ink rule, each cell `padding: 12px 0 12px 8px`, Archivo 800/9px/.1em, labels `TUNE · TEMPO · SHEETS · LOOP · BEATS`, 2px ink left borders between cells. Active cell: accent fill, white label. **Tap targets are 44px+ tall** — keep that in production.

### Shell — desktop (1240 × 760)
1. **Header** — 60px, `0 20px`, bottom 2px ink rule. Left: `RIFF` (Archivo 900/26px) + mono 10px/.16em context line (`PRACTICE DESK · <TOOL>`). Right: two chips, 2px gap — a filled ink status chip and a 2px-outlined secondary action (`INSTALL APP`, `PRINT SHEET`, `EXPORT STEMS`).
2. **Body grid** — `196px 1fr 400px` (tuner, metronome, chord sheets) or `196px 1fr 300px` (loop station, beat maker), full height, `min-height: 0` on all three columns.
3. **Left rail** — five items, `padding: 14px 0 14px 16px`, Archivo 800/13px, separated by 2px divider rules; the active item is accent fill + white and gets a 2px **ink** bottom rule. Below the list, an 11px/1.5 Archivo hint paragraph in `--color-neutral-700` with `<b>` keyboard keys.
4. **Right panel** — `border-left: 2px solid var(--color-text)`; a mono 10px/.14em header row over 2px ink rule, then stacked sections divided by 2px rules.

### 1 · Tuner (mobile `2a`, desktop `1d`)
Purpose: get in tune in under two seconds, readable at arm's length on a floor.
- Meta line: mono 10px `STANDARD E · A4 = 440 HZ · STRING 6`.
- **Note readout**: letter at Archivo 800/156px (mobile) or 210px (desktop), `line-height: .78`, `letter-spacing: -.06em`, flush left; octave digit beside it in JetBrains Mono 32–44px, `--color-neutral-600`. Desktop adds an `IN TUNE` accent chip (Archivo 800/12px/.14em, `padding: 8px 12px`, white on accent).
- **Cent meter**: a row of 21 ticks, `width: 2px`, `background: var(--color-neutral-500)`, heights 11px / 20px (every 5th) / 30px (center), aligned to a 2px ink baseline; a 4px accent bar marks the reading (53% ≈ +3 cents). Range −50…+50 cents. "In tune" band = ±5 cents.
- **String row**: 6 equal cells, 2px ink rules, note letter Archivo 800/20–22px + mono 9px scientific pitch (`E2`). Active string = accent.
- **Input meter**: 28 bars, 3px gap, `--color-neutral-400`, 14–66px tall, driven by live mic RMS.
- **Tunings list** (mobile): rows `padding: 9px 10px`, Archivo 800/12px name + mono 9px string spelling; selected row accent fill/white, others `--color-neutral-200`. Presets: Standard E `E A D G B E`, Drop D `D A D G B E`, Open G `D G D G B D`.
- Desktop right panel doubles as the session panel: chord sheet title, chord chips, lyric lines, tablature, and a compact 4-track loop list.

### 2 · Metronome (mobile `2b`, desktop `2f`)
- BPM at Archivo 800/140px (mobile) or 190px (desktop), `letter-spacing: -.05em`; `BPM` in mono beside it. Meta: `MODERATO · 4/4 · RUNNING`, plus `BAR 3` on desktop.
- **Beat blocks**: 4 equal cells, 88px (mobile) / 120px (desktop) tall, framed by 2px ink rules top and bottom and between cells; beat index in the top-left corner (Archivo 800/11–13px). The current beat is an accent fill with white numeral — this is the only animated element (instant fill on beat, no fade).
- **Transport row**: mobile `− / TAP / +` in three cells; desktop `− 1 BPM / TAP TEMPO / + 1 BPM / STOP`, the last accent-filled.
- **Two-up settings**: `SUBDIVISION: EIGHTHS`, `ACCENT: BEAT 1` — mono 9px caption over Archivo 800/17px value.
- **Tempo trainer**: 12–14px track in `--color-neutral-300` with an accent fill at 38%; caption `96 → 128 OVER 8 BARS`.
- Desktop right panel: setlist tempos (Archivo 800/13px title + mono `96 · E`) and a click-sound list (`WOODBLOCK` selected/accent, `RIM`, `BEEP`).

### 3 · Chord sheets (mobile `2c`, desktop `2g`)
- Song title Archivo 800/30px (mobile) or 46px (desktop), `letter-spacing: -.02/-.03em`; meta mono 10–11px `KEY OF E · 96 BPM · 4/4 · VERSE 1`.
- **Control row**: `AUTOSCROLL / CAPO 0 / −1 SEMI` (mobile, three cells); desktop puts `−1 / CAPO 0 / +1` in the right panel and `AUTOSCROLL 96 BPM` in the header.
- **Chord chips**: Archivo 800/12px, `padding: 6px 10px`; active accent-filled white, others 2px ink outline.
- **Chords over lyrics**: chord line in JetBrains Mono 700/11px, `--color-accent-700`, positioned over the syllable; lyric line Archivo 400/15–16px, line-height 1.5. In production, store sheets in ChordPro (`[E5]Headlights on the...`) and render chords in an absolutely-positioned or monospace-aligned layer — do not fake alignment with `&nbsp;` as the prototype does.
- **Tablature**: JetBrains Mono 700, 11.5px (mobile) / 15px (desktop), line-height 1.55, `white-space: pre`, six lines `e B G D A E`. Must stay monospace and re-render on transpose.
- **Piano voicing**: 14 equal cells inside a 2px ink frame, 86–100px tall, 2px ink rules between; black keys are ink-filled at cells where `i % 7 ∈ {1,3,5}`; sounding notes (indices 0, 4, 7, 11 for E5) are accent-filled. This is a schematic strip, not a real keyboard — replace with a proper keyboard component keeping the same fills.
- Desktop main pane is a two-column verse/chorus grid split by a 2px ink rule, tablature below.
- Desktop right panel: setlist of 5 songs (title + `key · bpm`), transpose row, piano voicing, chord chips.

### 4 · Loop station (mobile `2d`, desktop `2h`)
- Bar counter: `4` at Archivo 800/78–84px + mono `BARS · 96 BPM · QUANTIZED`; desktop adds `BAR 3 / 4 · LATENCY 11 MS`.
- **Track lanes** — four: `RHYTHM` (4 bar, accent waveform = playing), `LEAD` (4 bar, ink), `BASS` (2 bar, ink), `VOX` (empty, `--color-neutral-300`). Mobile: each a 2px ink box with name + length, a 30px waveform of 22 bars (2px gap), and `MUTE / SOLO / CLEAR` mono 9px chips with 2px divider outlines. Desktop: full-width lanes, 52px waveform of 56 bars, name + length at left in a 96px column, `MUTE / SOLO` at right, lanes divided by 2px divider rules, with a 16-step mono ruler above.
- **Transport**: mobile `REC / PLAY / UNDO` (REC accent-filled, 18px vertical padding); desktop `REC / PLAY ALL / UNDO TAKE / CLEAR ALL`.
- Desktop right panel: **mixer** — 5 vertical faders (RHYTHM 78%, LEAD 62%, BASS 70%, VOX 0%, BEATS 54%) as `--color-neutral-200` tracks with accent fills anchored bottom, mono 8px name + dB below; then `INPUT: MIC · 62%`.
- Meta strip (mobile): `INPUT · MIC 62%` / `LATENCY 11 MS`.

### 5 · Beat maker (mobile `2e`, desktop `2i`)
- Kit name Archivo 800/40px (mobile) / 52px (desktop); meta `96 BPM · 16 STEPS · SWING 12%`; desktop shows `STEP 07 / 16`.
- **Step grid** — 6 rows (`KICK SNARE HAT CLAP TOM CRASH`) × 16 steps. Cells are square-ish (22px mobile, 44px desktop), `gap: 2–3px`, each with `outline: 2px solid var(--color-text); outline-offset: -2px` (outline, not border, so the grid doesn't reflow). Active = accent fill; inactive = transparent, except every 4th column which is `--color-neutral-200` on desktop to mark beats. Row labels Archivo 800/10–13px/.1em.
- Default pattern (1 = hit): KICK `1000001010000010`, SNARE `0000100000000101`, HAT `1010101010101011`, CLAP `0000000000001000`, TOM `0000000100000001`, CRASH `1000000000000000`.
- Step numbers `01…16` in JetBrains Mono 7–8px above the grid.
- Actions: mobile `SEND TO LOOP` + `PLAY PATTERN` (accent); desktop `PLAY PATTERN` (accent) / `CLEAR ROW` / `DUPLICATE BAR`.
- Desktop right panel: kit list (`GARAGE` active/accent, `ROOM 1972`, `DRY STUDIO`, `MACHINE`) and three sliders — `SWING 12%`, `VELOCITY HARD` (78%), `ROOM 32%` — 12px tracks, accent fill.

## Interactions & behavior
- **Navigation**: bottom tab bar (mobile) / left rail (desktop) switches tools; state per tool persists across switches (a running metronome keeps running while you look at a chord sheet). Desktop keyboard: `1–5` switch tool, `Space` start/stop click, `R` arm loop recording, `[` `]` nudge tempo ±1, `↑ ↓` transpose.
- **Tuner**: mic via `getUserMedia`, pitch detection (autocorrelation or YIN) at ~20 Hz. Hold the last reading ~2s after the note decays instead of snapping to empty. Cent marker moves with a short (~80ms) linear transition; no springy easing.
- **Metronome**: schedule clicks with `AudioContext.currentTime` lookahead (~25ms interval, 100ms horizon) — never `setInterval` alone. Beat block fills on the scheduled beat with no transition; accent beat uses a different sample. Tempo trainer ramps linearly over the configured bars, then holds.
- **Chord sheets**: autoscroll speed derived from BPM; transpose re-renders chord names, tablature fret numbers, and piano fills together. Autoscroll pauses on user scroll and resumes after ~3s.
- **Loop station**: record quantized to the bar (a late downbeat lands on the grid); `UNDO TAKE` pops the last layer per track; overdub appends into the armed track. Waveform renders from the recorded buffer's peaks.
- **Beat maker**: click a step to toggle, drag across a row to paint, `Shift`-click clears. Playhead highlights the current column; pattern loops to the shared clock so it stays locked to the metronome and loop station.
- **Shared transport**: one clock drives metronome, loop station, and beat maker. Changing BPM anywhere changes all three.
- **States to build that aren't drawn**: empty (no loops recorded / no sheets saved), mic-permission-denied, loading a sheet, save/export in progress, and a bluetooth-latency notice. Ask before designing them, or reuse the mono caption + 2px-ruled block pattern.
- **Hover / press / focus** (per the design system): interactive elements get an accent-ramp tint on hover, one step past base on press (`--color-accent-600` on light ground), and `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`. Never leave a default focus ring.
- **Responsive**: the two designs are the two breakpoints. Switch to the desktop layout at ~1024px; between 640–1024px keep the mobile column layout centered at 390–560px wide rather than stretching lanes.

## State
Per-tool state, all in one shared store (Zustand/Context is enough):
- `transport`: `{ bpm: 96, meter: [4,4], subdivision: 'eighths', accentBeat: 1, running: boolean, currentBeat, currentBar, trainer: {from, to, bars, progress} }`
- `tuner`: `{ tuning: 'Standard E'|'Drop D'|'Open G', a4: 440, detected: {note, octave, cents}, holdUntil, micLevel, permission }`
- `sheets`: `{ songs: Song[], activeId, capo: 0, transpose: 0, autoscroll: boolean }` where `Song = {title, key, bpm, sections: [{name, lines: [{chords, lyric}]}], tab: string[]}`
- `loops`: `{ tracks: [{name, bars, buffer, playing, muted, solo, gain}], armed, quantize: true, inputLevel, latencyMs }`
- `beats`: `{ kit, steps: Record<Instrument, boolean[16]>, swing: 12, velocity: 'hard', room: 32, playing, step }`
- PWA: persist songs/patterns/tunings to IndexedDB; app shell cached by the service worker so all five tools work offline.

## Sample content (exact copy used)
Song: **DEAD AIR ON THE HIGHWAY**, key of E, 96 BPM. Verse: "Headlights on the county line" (`E5 … G5`) / "Amp hum keeping perfect time" (`A5 … D5`). Chorus: "Dead air, dead air on the dial" (`D5 … A5`) / "Nothing on for a hundred mile" (`E5 … G5`). Chords `E5 G5 A5 D5`.
Setlist: DEAD AIR ON THE HIGHWAY (E, 96) · CHEAP AMPLIFIER (A, 112) · SIDE ONE, TRACK TWO (D, 84) · NIGHT SHIFT BLUES (G, 72) · BASEMENT TAPE (C, 128).
Tablature (verse riff, monospace):
```
e|--------------------------|
B|--------------------------|
G|---------7-7-7------------|
D|--7-7-7--7-7-7-----5-5-5--|
A|--7-7-7--5-5-5-----5-5-5--|
E|--5-5-5------------3-3-3--|
```

## Assets
None. No images, no icons, no logos — the wordmark is live type (Archivo 900, `letter-spacing: -.03em`). Fonts load from Google Fonts (Archivo 400–900, JetBrains Mono 400/700); self-host them for offline use. Waveforms and meters in the prototype are seeded pseudo-random values — replace with real audio data.

## Files
- `RIFF - Musician PWA.dc.html` — all screens. Turn 2 (top of the page) is the approved build: `2a` mobile tuner, `2b` mobile metronome, `2c` mobile chord sheet, `2d` mobile loop station, `2e` mobile beat maker, `2f` desktop metronome, `2g` desktop chord sheets, `2h` desktop loop station, `2i` desktop beat maker. Turn 1 below it holds the earlier artwork explorations plus `1d`, the approved **desktop tuner**. Ignore `1b` and `1c` (rejected directions).
- `modernist.css` — design tokens and base component classes. Port the `:root` block.
- `support.js` — prototype runtime only; not part of the design.

For current build status, see the [main README](../README.md).
