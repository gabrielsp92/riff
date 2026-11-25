// Helpers for remembering microphone access across app launches.
//
// The browser owns the real permission; we just (a) ask it via the
// Permissions API when available, and (b) keep a localStorage flag as a
// fallback for browsers that don't expose mic state there (older iOS
// Safari), so the Tuner can skip its "ENABLE MICROPHONE" gate after the
// first successful grant.

export type MicPermissionState = "granted" | "denied" | "prompt" | "unknown";

export const MIC_GRANTED_KEY = "riff:micGranted";

/** Returns the PermissionStatus for the mic, or null if the API isn't usable. */
export async function getMicPermissionStatus(): Promise<PermissionStatus | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
    return await navigator.permissions.query({ name: "microphone" as PermissionName });
  } catch {
    return null;
  }
}

export async function queryMicPermission(): Promise<MicPermissionState> {
  const status = await getMicPermissionStatus();
  if (!status) return "unknown";
  const s = status.state;
  return s === "granted" || s === "denied" || s === "prompt" ? s : "unknown";
}

export function getMicGrantedFlag(): boolean {
  try {
    return localStorage.getItem(MIC_GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMicGrantedFlag(): void {
  try {
    localStorage.setItem(MIC_GRANTED_KEY, "1");
  } catch {
    // storage unavailable (private mode etc.) — nothing to remember
  }
}

export function clearMicGrantedFlag(): void {
  try {
    localStorage.removeItem(MIC_GRANTED_KEY);
  } catch {
    // ignore
  }
}

/**
 * Decide what the Tuner should do on mount:
 * - "start": request the mic right away (no in-app gate)
 * - "denied": show the blocked state
 * - "gate": show the "ENABLE MICROPHONE" button
 */
export function decideMicAutoStart(
  state: MicPermissionState,
  flag: boolean
): "start" | "denied" | "gate" {
  if (state === "granted") return "start";
  if (state === "denied") return "denied";
  return flag ? "start" : "gate";
}
