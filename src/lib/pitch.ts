// Low enough for a softly plucked high E string (thin, quiet, fast decay) with AGC off.
const MIN_RMS = 0.003;
// Overlap-normalized autocorrelation at the detected period vs. lag 0; noise scores well below this.
const MIN_CLARITY = 0.8;
// Covers every tuning shifted ±12 semitones, and rejects noise-driven outliers.
const MIN_FREQ = 30;
const MAX_FREQ = 1500;

/**
 * Autocorrelation pitch detector (ACF2+), after Chris Wilson's reference
 * implementation. Returns -1 when the signal is too quiet, no clear
 * periodicity is found, or the result is outside the instrument range.
 */
export function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;

  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    const val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < MIN_RMS) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const threshold = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < threshold) {
      r2 = SIZE - i;
      break;
    }
  }

  const trimmed = buf.slice(r1, r2);
  const newSize = trimmed.length;
  if (newSize < 2) return -1;

  const c = new Array<number>(newSize).fill(0);
  for (let i = 0; i < newSize; i++) {
    for (let j = 0; j < newSize - i; j++) {
      c[i] += trimmed[j] * trimmed[j + i];
    }
  }

  let d = 0;
  while (d + 1 < newSize && c[d] > c[d + 1]) d++;

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < newSize; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  if (maxpos <= 0 || maxpos >= newSize - 1) return -1;

  const clarity = c[maxpos] / (newSize - maxpos) / (c[0] / newSize);
  if (clarity < MIN_CLARITY) return -1;

  let T0 = maxpos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  if (T0 <= 0) return -1;
  const freq = sampleRate / T0;
  if (freq < MIN_FREQ || freq > MAX_FREQ) return -1;
  return freq;
}

/** RMS amplitude of each of `segments` equal slices of a time-domain buffer, 0..1. */
export function segmentedRms(buf: Float32Array, segments: number): number[] {
  const out = new Array<number>(segments).fill(0);
  const chunk = Math.floor(buf.length / segments);
  for (let s = 0; s < segments; s++) {
    let sum = 0;
    const start = s * chunk;
    const end = start + chunk;
    for (let i = start; i < end; i++) {
      const v = buf[i];
      sum += v * v;
    }
    out[s] = Math.sqrt(sum / chunk);
  }
  return out;
}
