export function Placeholder({ label }: { label: string }) {
  return (
    <div className="m-4 flex flex-1 flex-col items-center justify-center gap-3 border-2 border-divider p-8 text-center">
      <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">NOT BUILT YET</div>
      <div className="font-sans text-lg font-extrabold">{label}</div>
      <p className="max-w-[260px] text-sm text-neutral-700">
        This screen isn&apos;t implemented in this pass — Tuner and Metronome are.
      </p>
    </div>
  );
}
