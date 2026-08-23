"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";

// Sheet viewer autoscroll (sheets-icd-v2.md §5.6, Assumption M): manual
// toggle + a small fixed set of speed presets, at a CONSTANT scroll rate —
// explicitly not derived from `sheet.bpm` (that was deliberately cut from
// this pass, superseding an older docs/DESIGN.md note). The
// pause-on-manual-scroll / resume-after-~3s behavior from that same
// docs/DESIGN.md section is kept. Keeps the component thin — all interval/
// rAF logic lives here.
export type AutoscrollSpeed = "slow" | "medium" | "fast";

export const AUTOSCROLL_SPEEDS: AutoscrollSpeed[] = ["slow", "medium", "fast"];

const SPEED_PX_PER_SECOND: Record<AutoscrollSpeed, number> = {
  slow: 18,
  medium: 36,
  fast: 64,
};

const RESUME_DELAY_MS = 3000;

export interface UseAutoscrollResult {
  enabled: boolean;
  toggle: () => void;
  speed: AutoscrollSpeed;
  setSpeed: (speed: AutoscrollSpeed) => void;
  paused: boolean; // true while temporarily paused by a manual scroll interaction
}

export function useAutoscroll(containerRef: RefObject<HTMLElement | null>): UseAutoscrollResult {
  const [enabled, setEnabled] = useState(false);
  const [speed, setSpeed] = useState<AutoscrollSpeed>("medium");
  const [paused, setPaused] = useState(false);

  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const pauseForInteraction = useCallback(() => {
    setPaused(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), RESUME_DELAY_MS);
  }, []);

  // The scroll loop itself — only runs while enabled and not paused.
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || paused || !container) return;

    lastTsRef.current = null;
    const step = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const deltaSeconds = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      container.scrollTop += SPEED_PX_PER_SECOND[speed] * deltaSeconds;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, paused, speed, containerRef]);

  // Wheel/touch signal a deliberate manual scroll (as opposed to the
  // 'scroll' events our own rAF loop produces by writing `scrollTop`).
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    container.addEventListener("wheel", pauseForInteraction, { passive: true });
    container.addEventListener("touchmove", pauseForInteraction, { passive: true });
    return () => {
      container.removeEventListener("wheel", pauseForInteraction);
      container.removeEventListener("touchmove", pauseForInteraction);
    };
  }, [enabled, containerRef, pauseForInteraction]);

  useEffect(
    () => () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    },
    []
  );

  const toggle = useCallback(() => {
    setEnabled((e) => !e);
    setPaused(false);
  }, []);

  return { enabled, toggle, speed, setSpeed, paused };
}
