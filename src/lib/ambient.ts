import { useSyncExternalStore } from "react";
import { idbRequest, idbStore } from "@/lib/idb";
import { pomodoro, type PomodoroState } from "@/lib/pomodoro";

export const BUILT_IN = { brown: "Brown noise", pink: "Pink noise", white: "White noise", rain: "Rain" } as const;
export type BuiltIn = keyof typeof BUILT_IN;

const KEY = "crystal-os-ambient";
const DB = "crystal-os-sounds";
const FILE = "file:";
const VOLUME = 0.25;
export const MAX_SOUND_BYTES = 20 * 1024 * 1024;

export const soundLabel = (id: string) => (id.startsWith(FILE) ? id.slice(FILE.length) : (BUILT_IN[id as BuiltIn] ?? "Off"));

export function fillNoise(kind: BuiltIn, out: Float32Array, random: () => number = Math.random) {
  let brown = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < out.length; i++) {
    const white = random() * 2 - 1;
    if (kind === "brown") {
      brown = (brown + 0.02 * white) / 1.02;
      out[i] = Math.max(-1, Math.min(1, brown * 3.5));
    } else if (kind === "pink") {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      out[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.1848) * 0.2));
    } else {
      out[i] = white;
    }
  }
}

export function wantedSound(timer: Pick<PomodoroState, "running" | "phase">, sound: string): string | null {
  return timer.running && timer.phase === "focus" && sound !== "off" ? sound : null;
}

interface AmbientState {
  sound: string;
  custom: string[];
}

let state: AmbientState = { sound: "off", custom: [] };
const listeners = new Set<() => void>();
const set = (next: AmbientState) => {
  state = next;
  listeners.forEach((l) => l());
  void sync();
};

let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let playing: string | null = null;

function stop() {
  source?.stop();
  source?.disconnect();
  source = null;
}

async function bufferFor(ctx: AudioContext, sound: string): Promise<AudioBuffer> {
  if (sound.startsWith(FILE)) {
    const blob = (await idbRequest((await idbStore(DB, "readonly")).get(sound.slice(FILE.length)))) as Blob;
    return ctx.decodeAudioData(await blob.arrayBuffer());
  }
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  fillNoise(sound as BuiltIn, buffer.getChannelData(0));
  return buffer;
}

async function sync() {
  const want = wantedSound(pomodoro.getState(), state.sound);
  if (want === playing) return;
  playing = want;
  stop();
  if (!want) return;
  try {
    context ??= new AudioContext();
    await context.resume();
    const buffer = await bufferFor(context, want);
    if (playing !== want) return;
    stop();
    source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = VOLUME;
    let tail: AudioNode = source;
    if (want === "rain") {
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 2400;
      band.Q.value = 0.4;
      tail = source.connect(band);
    }
    tail.connect(gain).connect(context.destination);
    source.start();
  } catch (err) {
    playing = null;
    console.warn("[ambient] could not play", want, err);
  }
}

async function customNames(): Promise<string[]> {
  try {
    return ((await idbRequest((await idbStore(DB, "readonly")).getAllKeys())) as string[]).sort();
  } catch {
    return [];
  }
}

export const ambient = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  init() {
    try {
      state = { ...state, sound: localStorage.getItem(KEY) ?? "off" };
    } catch {
      /* ignore localStorage errors */
    }
    void customNames().then((custom) => set({ ...state, custom }));
    return pomodoro.subscribe(() => void sync());
  },

  setSound(sound: string) {
    try {
      localStorage.setItem(KEY, sound);
    } catch {
      /* ignore localStorage errors */
    }
    set({ ...state, sound });
  },

  async addSound(file: File): Promise<string | null> {
    if (!file.type.startsWith("audio/")) return "Pick an audio file (MP3, OGG, WAV or M4A).";
    if (file.size > MAX_SOUND_BYTES) return "That file is over 20 MB.";
    const name = file.name.replace(/\.[^.]+$/, "").trim() || "Sound";
    await idbRequest((await idbStore(DB, "readwrite")).put(file, name));
    set({ ...state, custom: await customNames() });
    return null;
  },

  async removeSound(name: string) {
    await idbRequest((await idbStore(DB, "readwrite")).delete(name));
    if (state.sound === FILE + name) ambient.setSound("off");
    set({ ...state, custom: await customNames() });
  },
};

export const customSoundId = (name: string) => FILE + name;

export function useAmbient() {
  return useSyncExternalStore(ambient.subscribe, ambient.getState);
}
