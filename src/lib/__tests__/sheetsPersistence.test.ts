import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sheet } from "@/lib/store";

// Mock idb-keyval entirely so these tests exercise the adapter's own
// success/warn/error branching without touching a real IndexedDB (not
// available in Vitest's "node" test environment anyway).
vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

import { del, get, set } from "idb-keyval";
import {
  createSheetsIndexedDbStorage,
  SHEETS_STORAGE_KEY,
  STORAGE_UNAVAILABLE_MESSAGE,
} from "@/lib/sheetsPersistence";

const mockedGet = vi.mocked(get);
const mockedSet = vi.mocked(set);
const mockedDel = vi.mocked(del);

const VALID_SHEET: Sheet = {
  id: "s1",
  title: "Test Sheet",
  key: "E",
  bpm: 100,
  timeSignature: { beats: 4, unit: 4 },
  capo: 0,
  transposeSemitones: 0,
  sections: [],
  chordOverrides: [],
  annotations: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedSet.mockReset();
  mockedDel.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("createSheetsIndexedDbStorage.getItem", () => {
  it("returns null (no warn, no error) when nothing has been persisted yet", async () => {
    mockedGet.mockResolvedValue(undefined);
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    const result = await storage.getItem(SHEETS_STORAGE_KEY);
    expect(result).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns the persisted value unchanged when it's well-formed", async () => {
    const value = { state: { sheets: [VALID_SHEET] }, version: 0 };
    mockedGet.mockResolvedValue(value);
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    const result = await storage.getItem(SHEETS_STORAGE_KEY);
    expect(result).toEqual(value);
    expect(onError).not.toHaveBeenCalled();
  });

  it("drops corrupt/unrecognized data with a console.warn, not persistenceError (ICD §3.2)", async () => {
    mockedGet.mockResolvedValue({ state: { sheets: "not-an-array" }, version: 0 });
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    const result = await storage.getItem(SHEETS_STORAGE_KEY);
    expect(result).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("drops a persisted sheet missing required fields as corrupt data", async () => {
    mockedGet.mockResolvedValue({
      state: { sheets: [{ id: "s1", title: "Missing fields" }] },
      version: 0,
    });
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    const result = await storage.getItem(SHEETS_STORAGE_KEY);
    expect(result).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("reports persistenceError (not just a warn) when the read itself throws (ICD §3.4)", async () => {
    mockedGet.mockRejectedValue(new Error("IndexedDB disabled"));
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    const result = await storage.getItem(SHEETS_STORAGE_KEY);
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith(STORAGE_UNAVAILABLE_MESSAGE);
  });
});

describe("createSheetsIndexedDbStorage.setItem", () => {
  it("writes through to idb-keyval's set", async () => {
    mockedSet.mockResolvedValue(undefined);
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    const value = { state: { sheets: [VALID_SHEET] }, version: 0 };
    await storage.setItem(SHEETS_STORAGE_KEY, value);
    expect(mockedSet).toHaveBeenCalledWith(SHEETS_STORAGE_KEY, value);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports persistenceError when the write throws", async () => {
    mockedSet.mockRejectedValue(new Error("quota exceeded"));
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    await storage.setItem(SHEETS_STORAGE_KEY, { state: { sheets: [] }, version: 0 });
    expect(onError).toHaveBeenCalledWith(STORAGE_UNAVAILABLE_MESSAGE);
  });
});

describe("createSheetsIndexedDbStorage.removeItem", () => {
  it("writes through to idb-keyval's del", async () => {
    mockedDel.mockResolvedValue(undefined);
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    await storage.removeItem(SHEETS_STORAGE_KEY);
    expect(mockedDel).toHaveBeenCalledWith(SHEETS_STORAGE_KEY);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports persistenceError when the removal throws", async () => {
    mockedDel.mockRejectedValue(new Error("IndexedDB disabled"));
    const onError = vi.fn();
    const storage = createSheetsIndexedDbStorage(onError);
    await storage.removeItem(SHEETS_STORAGE_KEY);
    expect(onError).toHaveBeenCalledWith(STORAGE_UNAVAILABLE_MESSAGE);
  });
});
