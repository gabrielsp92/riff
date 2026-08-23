"use client";

import { RefObject, useEffect, useState } from "react";
import { Annotation, Line, Section, Sheet, useToolStore, useTransportStore } from "@/lib/store";

// ---------------------------------------------------------------------------
// Annotation -> highlight-range extraction (sheets-icd-v2.md §3.3). The
// viewer/editor screen (not buildLineSegments itself) is responsible for
// turning a line's Annotations into the highlightRanges array
// buildLineSegments takes.
// ---------------------------------------------------------------------------
export function highlightRangesForLine(
  sectionId: string,
  lineIndex: number,
  line: Line,
  annotations: Annotation[]
): Array<[number, number]> {
  return annotations
    .filter((a) => a.type === "highlight" && a.target.sectionId === sectionId && a.target.lineIndex === lineIndex)
    .map((a) => a.target.range ?? [0, line.lyrics.length]);
}

// "Note"-type annotations are not part of buildLineSegments (§3.3) — they
// render as a separate margin block below the line they target (§5.3).
export function noteAnnotationsForLine(
  sectionId: string,
  lineIndex: number,
  annotations: Annotation[]
): Annotation[] {
  return annotations.filter(
    (a) => a.type === "note" && a.target.sectionId === sectionId && a.target.lineIndex === lineIndex
  );
}

// ---------------------------------------------------------------------------
// "Send to Metronome" (sheets-icd-v2.md §2, Assumption O) — only bpm/meter
// are written; running/subdivision/accentBeat/clickSound are left untouched.
// ---------------------------------------------------------------------------
export function sendToMetronome(sheet: Pick<Sheet, "bpm" | "timeSignature">) {
  useTransportStore.getState().setBpm(sheet.bpm);
  useTransportStore.getState().setMeter([sheet.timeSignature.beats, sheet.timeSignature.unit]);
  useToolStore.getState().setTool("metronome");
}

export function scrollToSection(sectionId: string) {
  document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// Section jump nav's "current section label" (sheets-icd-v2.md §5.4) — an
// IntersectionObserver watching each section's top-of-viewport crossing,
// falling back to whichever section is nearest the top if none is currently
// intersecting. Purely a frontend implementation detail, shared between the
// mobile and desktop viewers to avoid two divergent implementations.
// ---------------------------------------------------------------------------
export function useCurrentSectionLabel(containerRef: RefObject<HTMLElement | null>, sections: Section[]): string {
  const [currentLabel, setCurrentLabel] = useState(sections[0]?.label ?? "");

  useEffect(() => {
    setCurrentLabel(sections[0]?.label ?? "");

    const container = containerRef.current;
    if (!container || sections.length === 0) return;

    const nodes = sections
      .map((s) => document.getElementById(`section-${s.id}`))
      .filter((n): n is HTMLElement => n !== null);
    if (nodes.length === 0) return;

    const intersecting = new Set<string>();
    const labelForNodeId = (id: string) => {
      const section = sections.find((s) => `section-${s.id}` === id);
      return section?.label;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.add(entry.target.id);
          else intersecting.delete(entry.target.id);
        }

        const candidates = intersecting.size > 0 ? nodes.filter((n) => intersecting.has(n.id)) : nodes;
        const nearest = candidates
          .slice()
          .sort((a, b) => Math.abs(a.getBoundingClientRect().top) - Math.abs(b.getBoundingClientRect().top))[0];
        const label = nearest ? labelForNodeId(nearest.id) : undefined;
        if (label !== undefined) setCurrentLabel(label);
      },
      { root: container, threshold: 0, rootMargin: "0px 0px -80% 0px" }
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [containerRef, sections]);

  return currentLabel;
}
