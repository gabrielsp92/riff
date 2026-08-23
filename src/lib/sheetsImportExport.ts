// Export/import — the only backup mechanism for sheets in this pass
// (sheets-icd.md §3.3). `exportSheet`/`exportLibrary` are pure reads off
// `useSheetsStore`; `importFile` runs a full runtime shape check on
// untrusted JSON *before* touching the store, then appends fresh-id'd
// sheets via `useSheetsStore.addSheet` (never overwrites by id — see
// Assumption C).
import {
  Annotation,
  AnnotationType,
  ChordOverride,
  NewSheetInput,
  Sheet,
  Section,
  TimeSignature,
  useSheetsStore,
} from "./store";

export interface SheetExportFile {
  formatVersion: 1;
  kind: "sheet";
  exportedAt: string; // ISO 8601
  sheet: Sheet;
}

export interface LibraryExportFile {
  formatVersion: 1;
  kind: "library";
  exportedAt: string;
  sheets: Sheet[];
}

export type ImportResult =
  | { ok: true; importedSheetIds: string[]; count: number }
  | { ok: false; error: ImportError };

export interface ImportError {
  code: "invalid_json" | "unsupported_format_version" | "malformed_sheet";
  message: string; // human-readable, safe to show verbatim in the UI
  details?: unknown; // e.g. which field failed validation — for a console.error, not for display
}

/** Deep-clones via JSON round-trip so a caller can't mutate the live store's
 * sheet objects through a returned export payload, and so the shape exactly
 * matches what a real serialized file will contain (e.g. `undefined` fields
 * dropped, same as `JSON.stringify` would do). */
function cloneForExport<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function exportSheet(id: string): SheetExportFile | null {
  const sheet = useSheetsStore.getState().getSheet(id);
  if (!sheet) return null;
  return {
    formatVersion: 1,
    kind: "sheet",
    exportedAt: new Date().toISOString(),
    sheet: cloneForExport(sheet),
  };
}

export function exportLibrary(): LibraryExportFile {
  return {
    formatVersion: 1,
    kind: "library",
    exportedAt: new Date().toISOString(),
    sheets: cloneForExport(useSheetsStore.getState().sheets),
  };
}

// ---------------------------------------------------------------------------
// Import — full runtime shape validation, never throws.
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type ShapeFailure = { ok: false; error: ImportError };
type ShapeSuccess = { ok: true; sheet: ValidatedSheetFields };
type ShapeResult = ShapeSuccess | ShapeFailure;

// Everything on `Sheet` except the fields import always regenerates
// (`id`, `createdAt`, `updatedAt`) — see sheets-icd.md §3.3.
type ValidatedSheetFields = Omit<Sheet, "id" | "createdAt" | "updatedAt">;

function malformed(field: string, message: string): ShapeFailure {
  return { ok: false, error: { code: "malformed_sheet", message, details: { field } } };
}

function missingField(field: string): ShapeFailure {
  return malformed(field, `Sheet is missing required field "${field}".`);
}

function invalidField(field: string, message: string): ShapeFailure {
  return malformed(field, message);
}

const ANNOTATION_TYPES: AnnotationType[] = ["note", "highlight"];

/**
 * Validates one raw (untrusted) value against the `Sheet` shape. `fieldPrefix`
 * namespaces field names in error `details` when validating sheets nested
 * inside a library file (e.g. `"sheets[2]."`) — for a single-sheet import
 * it's `""`, matching sheets-icd.md §5.5's literal `"bpm"` field name.
 */
function validateSheetShape(raw: unknown, fieldPrefix: string): ShapeResult {
  const p = (name: string) => `${fieldPrefix}${name}`;

  if (!isPlainObject(raw)) {
    return invalidField(p("sheet"), "Sheet is not a valid object.");
  }

  if (raw.title === undefined) return missingField(p("title"));
  if (typeof raw.title !== "string") {
    return invalidField(p("title"), `Sheet field "${p("title")}" must be a string.`);
  }
  if (raw.title.trim() === "") {
    return invalidField(p("title"), `Sheet field "${p("title")}" must not be empty.`);
  }

  if (raw.key !== undefined && typeof raw.key !== "string") {
    return invalidField(p("key"), `Sheet field "${p("key")}" must be a string.`);
  }

  if (raw.bpm === undefined) return missingField(p("bpm"));
  if (typeof raw.bpm !== "number" || !Number.isFinite(raw.bpm)) {
    return invalidField(p("bpm"), `Sheet field "${p("bpm")}" must be a number.`);
  }

  if (raw.timeSignature === undefined) return missingField(p("timeSignature"));
  if (!isPlainObject(raw.timeSignature)) {
    return invalidField(p("timeSignature"), `Sheet field "${p("timeSignature")}" must be an object.`);
  }
  const rawTs = raw.timeSignature;
  if (rawTs.beats === undefined) return missingField(p("timeSignature.beats"));
  if (typeof rawTs.beats !== "number") {
    return invalidField(p("timeSignature.beats"), `Sheet field "${p("timeSignature.beats")}" must be a number.`);
  }
  if (rawTs.unit === undefined) return missingField(p("timeSignature.unit"));
  if (typeof rawTs.unit !== "number") {
    return invalidField(p("timeSignature.unit"), `Sheet field "${p("timeSignature.unit")}" must be a number.`);
  }
  const timeSignature: TimeSignature = { beats: rawTs.beats, unit: rawTs.unit };

  if (raw.capo === undefined) return missingField(p("capo"));
  if (typeof raw.capo !== "number") {
    return invalidField(p("capo"), `Sheet field "${p("capo")}" must be a number.`);
  }

  if (raw.transposeSemitones === undefined) return missingField(p("transposeSemitones"));
  if (typeof raw.transposeSemitones !== "number") {
    return invalidField(p("transposeSemitones"), `Sheet field "${p("transposeSemitones")}" must be a number.`);
  }

  if (raw.sections === undefined) return missingField(p("sections"));
  if (!Array.isArray(raw.sections)) {
    return invalidField(p("sections"), `Sheet field "${p("sections")}" must be an array.`);
  }
  const sections: Section[] = [];
  for (let i = 0; i < raw.sections.length; i++) {
    const sectionResult = validateSection(raw.sections[i], p(`sections[${i}].`));
    if (!sectionResult.ok) return sectionResult;
    sections.push(sectionResult.section);
  }

  if (raw.chordOverrides === undefined) return missingField(p("chordOverrides"));
  if (!Array.isArray(raw.chordOverrides)) {
    return invalidField(p("chordOverrides"), `Sheet field "${p("chordOverrides")}" must be an array.`);
  }
  const chordOverrides: ChordOverride[] = [];
  for (let i = 0; i < raw.chordOverrides.length; i++) {
    const overrideResult = validateChordOverride(raw.chordOverrides[i], p(`chordOverrides[${i}].`));
    if (!overrideResult.ok) return overrideResult;
    chordOverrides.push(overrideResult.override);
  }

  if (raw.annotations === undefined) return missingField(p("annotations"));
  if (!Array.isArray(raw.annotations)) {
    return invalidField(p("annotations"), `Sheet field "${p("annotations")}" must be an array.`);
  }
  const annotations: Annotation[] = [];
  for (let i = 0; i < raw.annotations.length; i++) {
    const annotationResult = validateAnnotation(raw.annotations[i], p(`annotations[${i}].`));
    if (!annotationResult.ok) return annotationResult;
    annotations.push(annotationResult.annotation);
  }

  return {
    ok: true,
    sheet: {
      title: raw.title,
      key: raw.key as string | undefined,
      bpm: raw.bpm,
      timeSignature,
      capo: raw.capo,
      transposeSemitones: raw.transposeSemitones,
      sections,
      chordOverrides,
      annotations,
    },
  };
}

function validateSection(
  raw: unknown,
  fieldPrefix: string
): { ok: true; section: Section } | ShapeFailure {
  const p = (name: string) => `${fieldPrefix}${name}`;
  if (!isPlainObject(raw)) {
    return invalidField(fieldPrefix.replace(/\.$/, ""), "Section is not a valid object.");
  }
  if (raw.id === undefined) return missingField(p("id"));
  if (typeof raw.id !== "string") return invalidField(p("id"), `Section field "${p("id")}" must be a string.`);
  if (raw.label === undefined) return missingField(p("label"));
  if (typeof raw.label !== "string") return invalidField(p("label"), `Section field "${p("label")}" must be a string.`);
  if (raw.lines === undefined) return missingField(p("lines"));
  if (!Array.isArray(raw.lines)) return invalidField(p("lines"), `Section field "${p("lines")}" must be an array.`);

  const lines: Section["lines"] = [];
  for (let i = 0; i < raw.lines.length; i++) {
    const lineRaw = raw.lines[i];
    const lp = p(`lines[${i}].`);
    if (!isPlainObject(lineRaw)) {
      return invalidField(lp.replace(/\.$/, ""), "Line is not a valid object.");
    }
    if (lineRaw.lyrics === undefined) return missingField(`${lp}lyrics`);
    if (typeof lineRaw.lyrics !== "string") {
      return invalidField(`${lp}lyrics`, `Line field "${lp}lyrics" must be a string.`);
    }
    if (lineRaw.chordPlacements === undefined) return missingField(`${lp}chordPlacements`);
    if (!Array.isArray(lineRaw.chordPlacements)) {
      return invalidField(`${lp}chordPlacements`, `Line field "${lp}chordPlacements" must be an array.`);
    }
    const chordPlacements: Section["lines"][number]["chordPlacements"] = [];
    for (let k = 0; k < lineRaw.chordPlacements.length; k++) {
      const cpRaw = lineRaw.chordPlacements[k];
      const cpPrefix = `${lp}chordPlacements[${k}].`;
      if (!isPlainObject(cpRaw)) {
        return invalidField(cpPrefix.replace(/\.$/, ""), "Chord placement is not a valid object.");
      }
      if (cpRaw.chordId === undefined) return missingField(`${cpPrefix}chordId`);
      if (typeof cpRaw.chordId !== "string") {
        return invalidField(`${cpPrefix}chordId`, `Chord placement field "${cpPrefix}chordId" must be a string.`);
      }
      if (cpRaw.charIndex === undefined) return missingField(`${cpPrefix}charIndex`);
      if (typeof cpRaw.charIndex !== "number") {
        return invalidField(`${cpPrefix}charIndex`, `Chord placement field "${cpPrefix}charIndex" must be a number.`);
      }
      if (cpRaw.charIndex < 0 || cpRaw.charIndex > lineRaw.lyrics.length) {
        return invalidField(
          `${cpPrefix}charIndex`,
          `Chord placement field "${cpPrefix}charIndex" (${cpRaw.charIndex}) is out of bounds for a line of length ${lineRaw.lyrics.length}.`
        );
      }
      chordPlacements.push({ chordId: cpRaw.chordId, charIndex: cpRaw.charIndex });
    }
    lines.push({ lyrics: lineRaw.lyrics, chordPlacements });
  }

  return { ok: true, section: { id: raw.id, label: raw.label, lines } };
}

function validateChordOverride(
  raw: unknown,
  fieldPrefix: string
): { ok: true; override: ChordOverride } | ShapeFailure {
  const p = (name: string) => `${fieldPrefix}${name}`;
  if (!isPlainObject(raw)) {
    return invalidField(fieldPrefix.replace(/\.$/, ""), "Chord override is not a valid object.");
  }
  if (raw.chordId === undefined) return missingField(p("chordId"));
  if (typeof raw.chordId !== "string") {
    return invalidField(p("chordId"), `Chord override field "${p("chordId")}" must be a string.`);
  }
  if (raw.guitarFrets === undefined) return missingField(p("guitarFrets"));
  if (!Array.isArray(raw.guitarFrets) || raw.guitarFrets.length !== 6 || !raw.guitarFrets.every((f) => typeof f === "string")) {
    return invalidField(p("guitarFrets"), `Chord override field "${p("guitarFrets")}" must be an array of 6 strings.`);
  }
  if (raw.pianoKeys === undefined) return missingField(p("pianoKeys"));
  if (!Array.isArray(raw.pianoKeys) || !raw.pianoKeys.every((k) => typeof k === "string")) {
    return invalidField(p("pianoKeys"), `Chord override field "${p("pianoKeys")}" must be an array of strings.`);
  }
  return {
    ok: true,
    override: { chordId: raw.chordId, guitarFrets: raw.guitarFrets as string[], pianoKeys: raw.pianoKeys as string[] },
  };
}

function validateAnnotation(
  raw: unknown,
  fieldPrefix: string
): { ok: true; annotation: Annotation } | ShapeFailure {
  const p = (name: string) => `${fieldPrefix}${name}`;
  if (!isPlainObject(raw)) {
    return invalidField(fieldPrefix.replace(/\.$/, ""), "Annotation is not a valid object.");
  }
  if (raw.id === undefined) return missingField(p("id"));
  if (typeof raw.id !== "string") return invalidField(p("id"), `Annotation field "${p("id")}" must be a string.`);

  if (raw.type === undefined) return missingField(p("type"));
  if (typeof raw.type !== "string" || !ANNOTATION_TYPES.includes(raw.type as AnnotationType)) {
    return invalidField(p("type"), `Annotation field "${p("type")}" must be one of "note" or "highlight".`);
  }
  const type = raw.type as AnnotationType;

  if (raw.target === undefined) return missingField(p("target"));
  if (!isPlainObject(raw.target)) {
    return invalidField(p("target"), `Annotation field "${p("target")}" must be an object.`);
  }
  const rawTarget = raw.target;
  if (rawTarget.sectionId === undefined) return missingField(`${p("target")}.sectionId`);
  if (typeof rawTarget.sectionId !== "string") {
    return invalidField(`${p("target")}.sectionId`, `Annotation field "${p("target")}.sectionId" must be a string.`);
  }
  if (rawTarget.lineIndex === undefined) return missingField(`${p("target")}.lineIndex`);
  if (typeof rawTarget.lineIndex !== "number") {
    return invalidField(`${p("target")}.lineIndex`, `Annotation field "${p("target")}.lineIndex" must be a number.`);
  }
  let range: [number, number] | undefined;
  if (rawTarget.range !== undefined) {
    if (
      !Array.isArray(rawTarget.range) ||
      rawTarget.range.length !== 2 ||
      typeof rawTarget.range[0] !== "number" ||
      typeof rawTarget.range[1] !== "number"
    ) {
      return invalidField(`${p("target")}.range`, `Annotation field "${p("target")}.range" must be a [start, end) number tuple.`);
    }
    range = [rawTarget.range[0], rawTarget.range[1]];
  }

  if (type === "note" && typeof raw.content !== "string") {
    return missingField(p("content"));
  }
  const content = typeof raw.content === "string" ? raw.content : undefined;

  return {
    ok: true,
    annotation: {
      id: raw.id,
      type,
      target: { sectionId: rawTarget.sectionId, lineIndex: rawTarget.lineIndex, ...(range ? { range } : {}) },
      ...(content !== undefined ? { content } : {}),
    },
  };
}

function toNewSheetInput(sheet: ValidatedSheetFields): NewSheetInput {
  return {
    title: sheet.title,
    key: sheet.key,
    bpm: sheet.bpm,
    timeSignature: sheet.timeSignature,
    capo: sheet.capo,
    transposeSemitones: sheet.transposeSemitones,
    sections: sheet.sections,
    chordOverrides: sheet.chordOverrides,
    annotations: sheet.annotations,
  };
}

/**
 * Imports a previously-exported sheet or library file. `raw` is the result
 * of `JSON.parse`-ing the file's text — this function never throws, always
 * returning a discriminated `ImportResult` instead.
 *
 * Always assigns fresh ids (via `useSheetsStore.addSheet`, which itself uses
 * `crypto.randomUUID()`) and appends — it never overwrites an existing sheet
 * by id (sheets-icd.md §3.3, Assumption C). Runs full shape validation
 * before touching the store at all; a library file with any malformed sheet
 * imports none of them (fail-safe, not partial).
 */
export function importFile(raw: unknown): ImportResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: { code: "invalid_json", message: "File is not a recognized RIFF sheets export." } };
  }

  if (raw.formatVersion !== 1) {
    return {
      ok: false,
      error: {
        code: "unsupported_format_version",
        message: `Unsupported export format version "${String(raw.formatVersion)}".`,
        details: { formatVersion: raw.formatVersion },
      },
    };
  }

  if (raw.kind === "sheet") {
    const result = validateSheetShape(raw.sheet, "");
    if (!result.ok) return result;
    const id = useSheetsStore.getState().addSheet(toNewSheetInput(result.sheet));
    return { ok: true, importedSheetIds: [id], count: 1 };
  }

  if (raw.kind === "library") {
    if (!Array.isArray(raw.sheets)) {
      return { ok: false, error: { code: "malformed_sheet", message: 'Library export is missing required field "sheets".', details: { field: "sheets" } } };
    }
    const validated: ValidatedSheetFields[] = [];
    for (let i = 0; i < raw.sheets.length; i++) {
      const result = validateSheetShape(raw.sheets[i], `sheets[${i}].`);
      if (!result.ok) return result;
      validated.push(result.sheet);
    }
    const importedSheetIds = validated.map((sheet) => useSheetsStore.getState().addSheet(toNewSheetInput(sheet)));
    return { ok: true, importedSheetIds, count: importedSheetIds.length };
  }

  return {
    ok: false,
    error: { code: "invalid_json", message: `Unrecognized export "kind" "${String(raw.kind)}".` },
  };
}
