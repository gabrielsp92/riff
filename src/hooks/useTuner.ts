"use client";

import { useCallback, useEffect, useRef } from "react";
import { autoCorrelate, segmentedRms } from "@/lib/pitch";
import { noteFromFrequency } from "@/lib/music";
import { useTunerStore } from "@/lib/store";

const HOLD_MS = 2000;
const UPDATE_INTERVAL_MS = 50; // ~20Hz, per the interaction spec

type AudioContextCtor = typeof AudioContext;

/**
 * Owns the mic stream + analysis loop for the tuner. Mounted only while the
 * Tuner screen is active, so the browser's mic indicator only lights up
 * there. Auto-resumes without re-prompting if permission was already
 * granted earlier in the session.
 */
export function useTuner() {
  const a4 = useTunerStore((s) => s.a4);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);
  const lastGoodAtRef = useRef(0);
  const loopRef = useRef<() => void>(() => {});

  useEffect(() => {
    loopRef.current = () => {
      const analyser = analyserRef.current;
      const ctx = ctxRef.current;
      if (!analyser || !ctx) return;
      const now = performance.now();
      if (now - lastUpdateRef.current >= UPDATE_INTERVAL_MS) {
        lastUpdateRef.current = now;
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);

        const bars = segmentedRms(buf, 28).map((v) => Math.min(1, v * 6));
        const level = bars.reduce((a, b) => a + b, 0) / bars.length;
        useTunerStore.getState().setMeter(level, bars);

        const freq = autoCorrelate(buf, ctx.sampleRate);
        if (freq !== -1) {
          lastGoodAtRef.current = now;
          const note = noteFromFrequency(freq, a4);
          useTunerStore.getState().setDetected({
            name: note.name,
            octave: note.octave,
            cents: note.cents,
            midi: note.midi,
          });
        } else if (now - lastGoodAtRef.current > HOLD_MS) {
          useTunerStore.getState().setDetected(null);
        }
      }
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    };
  }, [a4]);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const requestMic = useCallback(async () => {
    useTunerStore.getState().setPermission("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const AC: AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      useTunerStore.getState().setPermission("granted");
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    } catch {
      useTunerStore.getState().setPermission("denied");
    }
  }, []);

  useEffect(() => {
    if (useTunerStore.getState().permission === "granted") {
      requestMic();
    }
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { requestMic };
}
