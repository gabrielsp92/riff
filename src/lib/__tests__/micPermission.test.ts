import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIC_GRANTED_KEY,
  clearMicGrantedFlag,
  decideMicAutoStart,
  getMicGrantedFlag,
  queryMicPermission,
  setMicGrantedFlag,
} from "@/lib/micPermission";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("queryMicPermission", () => {
  it("returns the Permissions API state", async () => {
    vi.stubGlobal("navigator", {
      permissions: { query: async () => ({ state: "granted" }) },
    });
    expect(await queryMicPermission()).toBe("granted");
  });

  it("returns unknown when the API is missing", async () => {
    vi.stubGlobal("navigator", {});
    expect(await queryMicPermission()).toBe("unknown");
  });

  it("returns unknown when query throws (e.g. unsupported name)", async () => {
    vi.stubGlobal("navigator", {
      permissions: {
        query: async () => {
          throw new TypeError("unsupported");
        },
      },
    });
    expect(await queryMicPermission()).toBe("unknown");
  });
});

describe("granted flag", () => {
  it("sets, reads and clears", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(getMicGrantedFlag()).toBe(false);
    setMicGrantedFlag();
    expect(storage.getItem(MIC_GRANTED_KEY)).toBe("1");
    expect(getMicGrantedFlag()).toBe(true);
    clearMicGrantedFlag();
    expect(getMicGrantedFlag()).toBe(false);
  });

  it("is safe when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(getMicGrantedFlag()).toBe(false);
    expect(() => setMicGrantedFlag()).not.toThrow();
    expect(() => clearMicGrantedFlag()).not.toThrow();
  });
});

describe("decideMicAutoStart", () => {
  it("starts when the browser reports granted", () => {
    expect(decideMicAutoStart("granted", false)).toBe("start");
  });
  it("shows denied when the browser reports denied, even with a stale flag", () => {
    expect(decideMicAutoStart("denied", true)).toBe("denied");
  });
  it("falls back to the flag when state is prompt/unknown", () => {
    expect(decideMicAutoStart("prompt", true)).toBe("start");
    expect(decideMicAutoStart("unknown", true)).toBe("start");
    expect(decideMicAutoStart("unknown", false)).toBe("gate");
  });
});
