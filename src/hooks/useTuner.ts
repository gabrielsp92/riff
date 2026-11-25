"use client";

import { useCallback, useEffect, useRef } from "react";
import { autoCorrelate, segmentedRms } from "@/lib/pitch";
import { noteFromFrequency } from "@/lib/music";
import { useTunerStore } from "@/lib/store";
import {
  MicPermissionState,
  clearMicGrantedFlag,
  decideMicAutoStart,
  getMicGrantedFlag,
  getMicPermissionStatus,
  setMicGrantedFlag,
} from "@/lib/micPermission";

const HOLD_MS = 2000;
const UPDATE_INTERVAL_MS = 50; // ~20Hz, per the interaction spec

type AudioContextCtor = typeof AudioContext;

/**
 * Owns the mic stream + analysis loop for the tuner. Mounted only while the
 * Tuner screen is active, so the browser's mic indicator only lights up
 * there. On mount it auto-starts the mic (skipping the in-app gate) when the
 * browser reports the permission as granted, or — where the Permissions API
 * can't tell (older iOS) — when a previous launch was granted.
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
      // Auto-started (no user gesture) contexts begin suspended on iOS.
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
        const resumeOnTouch = () => {
          ctxRef.current?.resume().catch(() => {});
        };
        window.addEventListener("pointerdown", resumeOnTouch, { once: true });
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      setMicGrantedFlag();
      useTunerStore.getState().setPermission("granted");
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    } catch {
      clearMicGrantedFlag();
      useTunerStore.getState().setPermission("denied");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!status) return;
      if (status.state === "denied") {
        clearMicGrantedFlag();
        teardown();
        useTunerStore.getState().setPermission("denied");
      } else if (
        status.state === "granted" &&
        !streamRef.current &&
        useTunerStore.getState().permission !== "requesting"
      ) {
        requestMic();
      }
    };

    (async () => {
      // Already running from earlier in this session.
      if (useTunerStore.getState().permission === "granted") {
        requestMic();
        return;
      }
      status = await getMicPermissionStatus();
      if (cancelled) return;
      status?.addEventListener("change", onChange);
      const state = status ? ((status.state as MicPermissionState) ?? "unknown") : "unknown";
      const decision = decideMicAutoStart(state, getMicGrantedFlag());
      if (decision === "start") requestMic();
      else if (decision === "denied") {
        clearMicGrantedFlag();
        useTunerStore.getState().setPermission("denied");
      }
    })();

    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { requestMic };
}
