let ctx: AudioContext | null = null;

function ensureContext(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Plays a short reference tone at `freq` Hz — tap a string to hear its target pitch. */
export function playReferenceTone(freq: number) {
  const audioCtx = ensureContext();
  const now = audioCtx.currentTime;
  const duration = 1.3;

  const osc = audioCtx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, now);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.32, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.15);
  gain.gain.setValueAtTime(0.16, now + duration - 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}
