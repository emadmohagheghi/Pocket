/**
 * UI sound cues synthesized with @web-kits/audio using the exact patch from
 * Kobra's Sound component (kobra.systems/components/sound) — no audio files.
 *
 * A small random detune/velocity jitter is applied per trigger, mirroring
 * Kobra's playback so repeated presses stay organic. Cues are intentionally
 * short and quiet so Pocket remains a calm utility.
 */

import { definePatch, ensureReady, setMasterVolume, type AudioPatch, type SoundPatch } from "@web-kits/audio";
import { api } from "@/lib/api";

export type PocketSound =
  | "tap"
  | "select"
  | "toggleOn"
  | "toggleOff"
  | "open"
  | "close"
  | "success"
  | "error"
  | "destructive"
  | "copy"
  | "blocked";

const ENABLED_KEY = "pocket-ui-sounds-enabled";
const VOLUME_KEY = "pocket-ui-sound-volume";
const DEFAULT_VOLUME = 0.28;

const PATCH = {
  name: "pocket-ui",
  sounds: {
    tap: {
      source: { type: "sine", frequency: 1300, fm: { ratio: 0.5, depth: 100 } },
      envelope: { attack: 0, decay: 0.015, sustain: 0, release: 0.005 },
      gain: 0.2,
    },
    select: {
      source: { type: "triangle", frequency: { start: 900, end: 780 } },
      envelope: { attack: 0.001, decay: 0.055 },
      gain: 0.26,
    },
    toggleOn: {
      source: { type: "sine", frequency: { start: 520, end: 880 } },
      envelope: { attack: 0.002, decay: 0.085 },
      gain: 0.3,
    },
    toggleOff: {
      source: { type: "sine", frequency: { start: 780, end: 420 } },
      envelope: { attack: 0.002, decay: 0.085 },
      gain: 0.28,
    },
    open: {
      source: { type: "triangle", frequency: { start: 320, end: 620 } },
      filter: { type: "lowpass", frequency: 2600 },
      envelope: { attack: 0.006, decay: 0.13 },
      gain: 0.24,
    },
    close: {
      source: { type: "triangle", frequency: { start: 560, end: 300 } },
      filter: { type: "lowpass", frequency: 2200 },
      envelope: { attack: 0.004, decay: 0.11 },
      gain: 0.22,
    },
    destructive: {
      layers: [
        {
          source: { type: "triangle", frequency: { start: 300, end: 170 } },
          filter: { type: "lowpass", frequency: 1400 },
          envelope: { attack: 0.002, decay: 0.12 },
          gain: 0.32,
        },
        {
          source: { type: "noise", color: "brown" },
          filter: { type: "bandpass", frequency: 700, resonance: 1.1 },
          envelope: { decay: 0.05 },
          gain: 0.06,
        },
      ],
    },
    success: {
      layers: [
        {
          source: { type: "triangle", frequency: 784 },
          envelope: { attack: 0.004, decay: 0.16 },
          gain: 0.22,
        },
        {
          source: { type: "triangle", frequency: 1175 },
          envelope: { attack: 0.004, decay: 0.22 },
          gain: 0.18,
          delay: 0.075,
        },
      ],
    },
    error: {
      layers: [
        {
          source: { type: "triangle", frequency: 300 },
          filter: { type: "lowpass", frequency: 1200 },
          envelope: { attack: 0.003, decay: 0.13 },
          gain: 0.26,
        },
        {
          source: { type: "triangle", frequency: 224 },
          filter: { type: "lowpass", frequency: 1000 },
          envelope: { attack: 0.003, decay: 0.2 },
          gain: 0.24,
          delay: 0.09,
        },
      ],
    },
    copy: {
      layers: [
        {
          source: { type: "sine", frequency: 1200 },
          envelope: { attack: 0, decay: 0.015, sustain: 0, release: 0.006 },
          gain: 0.16,
        },
        {
          source: { type: "sine", frequency: 1400 },
          envelope: { attack: 0, decay: 0.015, sustain: 0, release: 0.006 },
          delay: 0.04,
          gain: 0.14,
        },
      ],
    },
    blocked: {
      source: { type: "sine", frequency: 180 },
      filter: { type: "lowpass", frequency: 700 },
      envelope: { attack: 0.004, decay: 0.06 },
      gain: 0.16,
    },
  },
} as const satisfies SoundPatch;

/** Per-cue detune jitter in cents, copied from Kobra's JITTER table. */
const JITTER: Record<PocketSound, number> = {
  tap: 26,
  select: 22,
  toggleOn: 14,
  toggleOff: 14,
  open: 10,
  close: 10,
  destructive: 12,
  blocked: 30,
  copy: 6,
  success: 5,
  error: 5,
};

let patch: AudioPatch | null = null;
try {
  patch = definePatch(PATCH);
} catch (error) {
  patch = null;
  void api.log(`sound: definePatch FAILED: ${error}`);
}

function isEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

function volume(): number {
  try {
    // Number(null) is 0, not NaN — an absent key must fall back to the
    // default, not to silence (this exact bug muted every cue before).
    const stored = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored > 0 && stored <= 1
      ? stored
      : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function playPocketSound(sound: PocketSound): void {
  if (!isEnabled() || !patch) return;
  // The context starts suspended until a user gesture; ensureReady resumes it.
  void ensureReady()
    .then((ctx) => {
      setMasterVolume(volume());
      if (ctx.state !== "running") {
        void api.log(`sound: context ${ctx.state} while playing ${sound}`);
      }
      patch!.play(sound, {
        detune: (Math.random() * 2 - 1) * JITTER[sound],
        velocity: 0.9 + Math.random() * 0.1,
      });
    })
    .catch((error) => {
      void api.log(`sound: play FAILED: ${error}`);
    });
}

export function arePocketSoundsEnabled(): boolean {
  return isEnabled();
}

export function setPocketSoundsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(ENABLED_KEY, String(enabled));
  } catch {
    // Storage can be unavailable in a restricted webview; playback still works.
  }
}
