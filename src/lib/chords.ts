// Chord dictionary, capo/transpose math, and per-sheet resolution
// (sheets-icd.md §4). Epic 02.
import { NOTE_NAMES, NoteName } from "./music";
import { Sheet } from "./store";

// ---------------------------------------------------------------------------
// §4.2 — dictionary + lookupChordShape
// ---------------------------------------------------------------------------

export type ChordSource = "dictionary" | "unknown";

export interface ChordShape {
  guitarFrets: string[] | null; // null only when source === "unknown"
  pianoKeys: string[] | null; // null only when source === "unknown"
  source: ChordSource;
}

interface DictionaryEntry {
  guitarFrets: string[];
  pianoKeys: string[];
}

// Fixed acceptance values from sheets-icd.md §4.2 — keyed lowercase since
// lookup is case-insensitive after `.trim()`.
const CHORD_DICTIONARY: Record<string, DictionaryEntry> = {
  // Power chords (movable root-fifth-octave shape).
  e5: { guitarFrets: ["0", "2", "2", "x", "x", "x"], pianoKeys: ["E3", "B3"] },
  g5: { guitarFrets: ["3", "5", "5", "x", "x", "x"], pianoKeys: ["G3", "D4"] },
  a5: { guitarFrets: ["x", "0", "2", "2", "x", "x"], pianoKeys: ["A3", "E4"] },
  d5: { guitarFrets: ["x", "5", "7", "7", "x", "x"], pianoKeys: ["D3", "A3"] },

  // Open majors.
  c: { guitarFrets: ["x", "3", "2", "0", "1", "0"], pianoKeys: ["C3", "E3", "G3"] },
  d: { guitarFrets: ["x", "x", "0", "2", "3", "2"], pianoKeys: ["D3", "F#3", "A3"] },
  e: { guitarFrets: ["0", "2", "2", "1", "0", "0"], pianoKeys: ["E3", "G#3", "B3"] },
  g: { guitarFrets: ["3", "2", "0", "0", "0", "3"], pianoKeys: ["G3", "B3", "D4"] },
  a: { guitarFrets: ["x", "0", "2", "2", "2", "0"], pianoKeys: ["A3", "C#4", "E4"] },

  // Open minors.
  am: { guitarFrets: ["x", "0", "2", "2", "1", "0"], pianoKeys: ["A3", "C4", "E4"] },
  dm: { guitarFrets: ["x", "x", "0", "2", "3", "1"], pianoKeys: ["D3", "F3", "A3"] },
  em: { guitarFrets: ["0", "2", "2", "0", "0", "0"], pianoKeys: ["E3", "G3", "B3"] },

  // Open dominant 7ths.
  e7: { guitarFrets: ["0", "2", "0", "1", "0", "0"], pianoKeys: ["E3", "G#3", "B3", "D4"] },
  a7: { guitarFrets: ["x", "0", "2", "0", "2", "0"], pianoKeys: ["A3", "C#4", "E4", "G4"] },
  d7: { guitarFrets: ["x", "x", "0", "2", "1", "2"], pianoKeys: ["D3", "F#3", "A3", "C4"] },
  g7: { guitarFrets: ["3", "2", "0", "0", "0", "1"], pianoKeys: ["G3", "B3", "D4", "F4"] },
};

/**
 * Dictionary lookup + explicit `"unknown"` fallback — never throws, never
 * returns a blank-looking shape for an unrecognized chord.
 */
export function lookupChordShape(chordId: string): ChordShape {
  const entry = CHORD_DICTIONARY[chordId.trim().toLowerCase()];
  if (!entry) {
    return { guitarFrets: null, pianoKeys: null, source: "unknown" };
  }
  return { guitarFrets: [...entry.guitarFrets], pianoKeys: [...entry.pianoKeys], source: "dictionary" };
}

// ---------------------------------------------------------------------------
// §4.6 — transposeChordId (+ shared note-name parsing/respelling)
// ---------------------------------------------------------------------------

// Flat spellings accepted on input, always normalized to their sharp
// equivalent on output (Assumption D — sharps-only, matching music.ts's
// NOTE_NAMES).
const FLAT_TO_SHARP: Record<string, NoteName> = {
  Db: "C#",
  Eb: "D#",
  Fb: "E",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
  Cb: "B",
};

function noteNameToIndex(note: string): number | null {
  const sharpIndex = NOTE_NAMES.indexOf(note as NoteName);
  if (sharpIndex !== -1) return sharpIndex;
  const respelled = FLAT_TO_SHARP[note];
  return respelled ? NOTE_NAMES.indexOf(respelled) : null;
}

interface ParsedChordPart {
  root: string; // e.g. "E", "C#", "Bb" (pre-respelling)
  suffix: string; // e.g. "5", "m", "maj7", ""
}

// root: [A-G][#b]?, suffix: everything else.
const CHORD_PART_RE = /^([A-Ga-g])([#b]?)(.*)$/;

function parseChordPart(part: string): ParsedChordPart | null {
  const match = CHORD_PART_RE.exec(part);
  if (!match) return null;
  const [, letter, accidental, suffix] = match;
  return { root: letter.toUpperCase() + accidental, suffix };
}

function shiftNoteName(note: string, semitones: number): string {
  const index = noteNameToIndex(note);
  if (index === null) return note; // shouldn't happen given CHORD_PART_RE, but never throw
  const shifted = ((index + semitones) % 12 + 12) % 12;
  return NOTE_NAMES[shifted];
}

/**
 * Pitch-shifts a chord name by `semitones`, always respelling the result
 * with sharps only (Assumption D) — including at `semitones: 0`, which is
 * documented, not hidden, behavior. Unparseable input (root isn't `[A-G]`)
 * is returned unchanged rather than throwing.
 */
export function transposeChordId(chordId: string, semitones: number): string {
  const trimmed = chordId.trim();
  const slashIndex = trimmed.indexOf("/");
  const mainPart = slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex);
  const bassPart = slashIndex === -1 ? undefined : trimmed.slice(slashIndex + 1);

  const parsedMain = parseChordPart(mainPart);
  if (!parsedMain) return chordId;

  let result = shiftNoteName(parsedMain.root, semitones) + parsedMain.suffix;

  if (bassPart !== undefined) {
    const parsedBass = parseChordPart(bassPart);
    result += "/" + (parsedBass ? shiftNoteName(parsedBass.root, semitones) + parsedBass.suffix : bassPart);
  }

  return result;
}

// ---------------------------------------------------------------------------
// §4.4 — applyCapo
// ---------------------------------------------------------------------------

/**
 * Flat `+capo` offset on every fretted/open string; muted (`"x"`) strings
 * stay muted. See sheets-icd.md §4.4 for the physical justification and the
 * fixed worked example (`applyCapo(["3","2","0","0","0","3"], 2)` →
 * `["5","4","2","2","2","5"]`).
 */
export function applyCapo(frets: string[], capo: number): string[] {
  return frets.map((f) => (f === "x" ? "x" : String(Number(f) + capo)));
}

// ---------------------------------------------------------------------------
// §4.3 — resolveChordDisplay
// ---------------------------------------------------------------------------

export type ChordResolvedFrom = "override" | "dictionary" | "unknown";

export interface ResolvedChordDisplay {
  writtenChordId: string; // exactly as it appears in the sheet's chordPlacements
  lookupChordId: string; // the id actually used for dictionary lookup (== writtenChordId unless transposed)
  guitarFrets: string[] | null; // display-ready, capo already applied; null only when resolvedFrom === "unknown"
  pianoKeys: string[] | null; // null only when resolvedFrom === "unknown"
  resolvedFrom: ChordResolvedFrom;
}

/**
 * Composes override resolution, dictionary lookup, and the sheet's
 * capo/transpose settings into one display-ready answer — the function the
 * (future) viewer calls per rendered chord. See sheets-icd.md §4.3–§4.5.
 */
export function resolveChordDisplay(
  writtenChordId: string,
  sheet: Pick<Sheet, "chordOverrides" | "capo" | "transposeSemitones">
): ResolvedChordDisplay {
  const override = sheet.chordOverrides.find((o) => o.chordId === writtenChordId);
  if (override) {
    // Override wins outright: transposeSemitones is not re-applied (there's
    // no chord name left to reparse), but capo still applies (a physical
    // device independent of where the shape data came from). pianoKeys pass
    // through unchanged.
    return {
      writtenChordId,
      lookupChordId: writtenChordId,
      guitarFrets: applyCapo(override.guitarFrets, sheet.capo),
      pianoKeys: [...override.pianoKeys],
      resolvedFrom: "override",
    };
  }

  const lookupChordId = transposeChordId(writtenChordId, sheet.transposeSemitones);
  const shape = lookupChordShape(lookupChordId);
  if (shape.source === "unknown") {
    return { writtenChordId, lookupChordId, guitarFrets: null, pianoKeys: null, resolvedFrom: "unknown" };
  }

  return {
    writtenChordId,
    lookupChordId,
    // Piano has no capo — pianoKeys pass through from the (already
    // transpose-aware) dictionary lookup untouched (§4.5).
    guitarFrets: applyCapo(shape.guitarFrets as string[], sheet.capo),
    pianoKeys: shape.pianoKeys,
    resolvedFrom: "dictionary",
  };
}
