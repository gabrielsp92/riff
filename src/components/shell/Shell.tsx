"use client";

import { useEffect } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMetronomeEngine } from "@/hooks/useMetronomeEngine";
import { useToolStore, useTransportStore } from "@/lib/store";
import { ToolId } from "@/lib/tools";
import { MobileShell } from "./MobileShell";
import { DesktopShell } from "./DesktopShell";

const KEY_TO_TOOL: Record<string, ToolId> = {
  Digit1: "tuner",
  Digit2: "metronome",
  Digit3: "sheets",
  Digit4: "loop",
  Digit5: "beats",
};

export function Shell() {
  const tool = useToolStore((s) => s.tool);
  const setTool = useToolStore((s) => s.setTool);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useMetronomeEngine();

  const toggleRunning = useTransportStore((s) => s.toggleRunning);
  const nudgeBpm = useTransportStore((s) => s.nudgeBpm);

  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const nextTool = KEY_TO_TOOL[e.code];
      if (nextTool) {
        setTool(nextTool);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        toggleRunning();
      } else if (e.key === "[") {
        nudgeBpm(-1);
      } else if (e.key === "]") {
        nudgeBpm(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, toggleRunning, nudgeBpm, setTool]);

  return isDesktop ? (
    <DesktopShell tool={tool} setTool={setTool} />
  ) : (
    <MobileShell tool={tool} setTool={setTool} />
  );
}
