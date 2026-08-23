"use client";

import { useEffect } from "react";
import { getMetronomeEngine } from "@/lib/metronomeEngine";
import { useTransportStore } from "@/lib/store";

/**
 * Mount once at the app shell (not per-screen) so the click keeps running
 * while the user looks at another tool, per the shared-transport spec.
 */
export function useMetronomeEngine() {
  const running = useTransportStore((s) => s.running);

  useEffect(() => {
    const engine = getMetronomeEngine();
    if (running) {
      engine.start();
    } else {
      engine.stop();
    }
  }, [running]);
}
