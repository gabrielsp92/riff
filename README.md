# RIFF

A tuner-first practice PWA for bedroom songwriters and self-teaching players. One shell, five practice tools — **Tuner, Metronome, Chord sheets, Loop station, Beat maker** — sharing a single mobile / desktop layout, no backend required.

Design system: **Modernist** — flat, architectural, near-mono, no rounded corners, sparing red accent. Full design spec and tokens: [`docs/DESIGN.md`](docs/DESIGN.md).

## Status

| Tool | Status |
| --- | --- |
| Tuner | ✅ Built — live mic pitch detection, cent meter, string/tuning presets |
| Metronome | ✅ Built — Web Audio-scheduled click, tap tempo, tempo trainer |
| Chord sheets | ⏳ Not built |
| Loop station | ⏳ Not built |
| Beat maker | ⏳ Not built |

Unbuilt tools are reachable from the nav and show a placeholder screen.

## Stack

React (Next.js App Router) + TypeScript + Tailwind CSS + Zustand, with the Web Audio API driving all pitch detection and click scheduling. No backend, no database — everything runs client-side.

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). The Tuner needs mic access — grant it when prompted.

```bash
npm run build   # production build
npm run lint     # eslint
```

## Project structure

```
src/
  app/                 Next.js App Router entry (layout, page, fonts, globals.css)
  components/
    shell/              Responsive shell — mobile bottom tabs / desktop left rail
    tuner/               Tuner screens (mobile + desktop) and shared display logic
    metronome/           Metronome screens (mobile + desktop)
  hooks/                useTuner (mic + pitch detection), useMetronomeEngine, useMediaQuery
  lib/
    music.ts             Note/frequency/tuning math
    pitch.ts             Autocorrelation pitch detector
    metronomeEngine.ts   Lookahead Web Audio click scheduler
    store.ts             Shared Zustand state (tuner + transport)
    tools.ts, tempo.ts   Nav metadata, tempo-marking helper
docs/
  DESIGN.md              Full design handoff: screens, tokens, interaction spec, state shape
```

## Design reference

`RIFF - Musician PWA.dc.html` and `modernist.css` in the repo root are the original high-fidelity design prototype and token sheet — see [`docs/DESIGN.md`](docs/DESIGN.md) for how to read them.
