import { ClickSound, useTransportStore } from "./store";

interface QueuedNote {
  beatInBar: number;
  bar: number;
  time: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

/**
 * Schedules metronome clicks against AudioContext.currentTime with a
 * lookahead, per the interaction spec — never setInterval alone. A separate
 * requestAnimationFrame loop drains the note queue to update UI state in
 * sync with the audio, without ever driving the audio clock itself.
 */
class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private rafId: number | null = null;
  private nextNoteTime = 0;
  private beatInBar = 0;
  private bar = 1;
  private notesInQueue: QueuedNote[] = [];

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return this.ctx;
  }

  start() {
    if (this.timerId !== null) return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") ctx.resume();
    this.beatInBar = 0;
    this.bar = 1;
    this.notesInQueue = [];
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.scheduler();
    this.draw();
  }

  stop() {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.notesInQueue = [];
  }

  private scheduler = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.scheduleClick(this.beatInBar, this.nextNoteTime);
      this.advance();
    }
    this.timerId = window.setTimeout(this.scheduler, LOOKAHEAD_MS);
  };

  private advance() {
    const { bpm, meter, trainer } = useTransportStore.getState();
    this.nextNoteTime += 60 / bpm;
    this.beatInBar++;
    if (this.beatInBar >= meter[0]) {
      this.beatInBar = 0;
      this.bar++;
      if (trainer.enabled) {
        const progress = Math.min(1, (this.bar - 1) / trainer.bars);
        const nextBpm = Math.round(trainer.from + (trainer.to - trainer.from) * progress);
        useTransportStore.getState().setTrainerProgress(nextBpm);
      }
    }
  }

  private scheduleClick(beatInBar: number, time: number) {
    const { accentBeat, clickSound } = useTransportStore.getState();
    const accent = accentBeat !== 0 && beatInBar === accentBeat - 1;
    this.playClick(time, accent, clickSound);
    this.notesInQueue.push({ beatInBar, bar: this.bar, time });
  }

  private playClick(time: number, accent: boolean, sound: ClickSound) {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    let freq = accent ? 1600 : 1100;
    let duration = 0.035;
    let type: OscillatorType = "square";
    let peak = accent ? 0.85 : 0.55;

    if (sound === "rim") {
      type = "square";
      freq = accent ? 2600 : 1900;
      duration = 0.018;
      peak = accent ? 0.6 : 0.4;
    } else if (sound === "beep") {
      type = "sine";
      freq = accent ? 1760 : 880;
      duration = 0.09;
      peak = accent ? 0.8 : 0.5;
    }

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  private draw = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    let last: QueuedNote | null = null;
    while (this.notesInQueue.length && this.notesInQueue[0].time < ctx.currentTime) {
      last = this.notesInQueue.shift()!;
    }
    if (last) {
      useTransportStore.getState().setBeat(last.beatInBar, last.bar);
    }
    this.rafId = requestAnimationFrame(this.draw);
  };
}

let engine: MetronomeEngine | null = null;

export function getMetronomeEngine(): MetronomeEngine {
  if (!engine) engine = new MetronomeEngine();
  return engine;
}
