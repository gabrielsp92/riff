export type ToolId = "tuner" | "metronome" | "sheets" | "loop" | "beats";

export interface ToolMeta {
  id: ToolId;
  mobileLabel: string;
  desktopLabel: string;
  headerChip: string;
}

export const TOOLS: ToolMeta[] = [
  { id: "tuner", mobileLabel: "TUNE", desktopLabel: "TUNER", headerChip: "TUNER" },
  { id: "metronome", mobileLabel: "TEMPO", desktopLabel: "METRONOME", headerChip: "METRONOME" },
  { id: "sheets", mobileLabel: "SHEETS", desktopLabel: "CHORD SHEETS", headerChip: "CHORD SHEET" },
  { id: "loop", mobileLabel: "LOOP", desktopLabel: "LOOP STATION", headerChip: "LOOP STATION" },
  { id: "beats", mobileLabel: "BEATS", desktopLabel: "BEAT MAKER", headerChip: "BEAT MAKER" },
];
