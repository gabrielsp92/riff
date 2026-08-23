// IndexedDB persistence adapter for `useSheetsStore` (sheets-icd.md §3.2,
// §3.4). Wires zustand's `persist` middleware to `idb-keyval` instead of
// `localStorage` — sheets carry arbitrarily long nested arrays, and
// IndexedDB's async structured-clone API avoids the main-thread jank of
// localStorage's synchronous stringify model at that data size.
import { del, get, set } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { Sheet } from "./store";

export const SHEETS_STORAGE_KEY = "riff-sheets-v1";

export const STORAGE_UNAVAILABLE_MESSAGE =
  "Storage unavailable — changes won't be saved this session.";

// Only `sheets` is ever persisted (see `partialize` at the call site in
// store.ts) — this is the exact shape written to/read from IndexedDB.
export type PersistedSheetsState = { sheets: Sheet[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Lightweight structural sanity check for data coming back out of
// IndexedDB — not the full field-by-field validation `sheetsImportExport.ts`
// runs on untrusted import files (that one reports which field failed);
// this one only needs to decide "trust it" vs. "it's corrupt/from an
// incompatible future format, fall back to seed data" (sheets-icd.md §3.2).
function isPlausibleSheet(v: unknown): v is Sheet {
  if (!isPlainObject(v)) return false;
  if (typeof v.id !== "string") return false;
  if (typeof v.title !== "string") return false;
  if (typeof v.bpm !== "number") return false;
  if (!isPlainObject(v.timeSignature)) return false;
  if (typeof (v.timeSignature as Record<string, unknown>).beats !== "number") return false;
  if (typeof (v.timeSignature as Record<string, unknown>).unit !== "number") return false;
  if (typeof v.capo !== "number") return false;
  if (typeof v.transposeSemitones !== "number") return false;
  if (!Array.isArray(v.sections)) return false;
  if (!Array.isArray(v.chordOverrides)) return false;
  if (!Array.isArray(v.annotations)) return false;
  if (typeof v.createdAt !== "string") return false;
  if (typeof v.updatedAt !== "string") return false;
  return true;
}

function isPlausiblePersistedState(
  v: unknown
): v is StorageValue<PersistedSheetsState> {
  if (!isPlainObject(v)) return false;
  if (!isPlainObject(v.state)) return false;
  const sheets = (v.state as Record<string, unknown>).sheets;
  if (!Array.isArray(sheets)) return false;
  return sheets.every(isPlausibleSheet);
}

/**
 * Builds a zustand `PersistStorage` backed by `idb-keyval`.
 *
 * `onPersistenceError` is invoked (with a short human-readable message) only
 * when the storage backend itself throws on read/write (IndexedDB
 * unavailable, quota exceeded, disabled storage, etc.) — sheets-icd.md §3.4.
 * Corrupt/unparseable *data* (a plausible read that fails shape validation)
 * is a different case: it's logged via `console.warn` and treated as "no
 * persisted value", which lets the store fall back to its seed data instead
 * of crashing — it does NOT call `onPersistenceError` (that field is
 * reserved for read/write failures, sheets-icd.md §3.2).
 */
export function createSheetsIndexedDbStorage(
  onPersistenceError: (message: string) => void
): PersistStorage<PersistedSheetsState> {
  return {
    getItem: async (name) => {
      let raw: unknown;
      try {
        raw = await get(name);
      } catch (err) {
        console.warn(`sheetsPersistence: failed to read "${name}" from IndexedDB`, err);
        onPersistenceError(STORAGE_UNAVAILABLE_MESSAGE);
        return null;
      }
      if (raw === undefined || raw === null) return null;
      if (!isPlausiblePersistedState(raw)) {
        console.warn(
          `sheetsPersistence: discarding corrupt/unrecognized persisted value for "${name}", falling back to seed data`,
          raw
        );
        return null;
      }
      return raw;
    },
    setItem: async (name, value) => {
      try {
        await set(name, value);
      } catch (err) {
        console.warn(`sheetsPersistence: failed to write "${name}" to IndexedDB`, err);
        onPersistenceError(STORAGE_UNAVAILABLE_MESSAGE);
      }
    },
    removeItem: async (name) => {
      try {
        await del(name);
      } catch (err) {
        console.warn(`sheetsPersistence: failed to remove "${name}" from IndexedDB`, err);
        onPersistenceError(STORAGE_UNAVAILABLE_MESSAGE);
      }
    },
  };
}
