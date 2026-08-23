const MARKINGS: { max: number; name: string }[] = [
  { max: 60, name: "LARGO" },
  { max: 66, name: "LARGHETTO" },
  { max: 76, name: "ADAGIO" },
  { max: 108, name: "ANDANTE" },
  { max: 120, name: "MODERATO" },
  { max: 168, name: "ALLEGRO" },
  { max: 200, name: "PRESTO" },
  { max: Infinity, name: "PRESTISSIMO" },
];

export function tempoMarking(bpm: number): string {
  return MARKINGS.find((m) => bpm < m.max)?.name ?? "PRESTISSIMO";
}
