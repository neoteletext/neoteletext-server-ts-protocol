// A synth6581 note that starts when it is asked to: the "hard
// restart" of its programs (REQ-6414 item 1; the engine's DEC-6419).
//
// Why it exists. The chip's envelope counts its clock in a 15-bit rate
// counter and steps the envelope each time the counter reaches the period
// of the rate in force. No write resets that counter. When a gate is set
// and the attack's period is one the counter has already passed, the
// counter must run on to its top and wrap before the attack takes its
// first step: up to 32,768 cycles of the clock, about 33 ms. The delay
// depends on where the counter happened to be, so notes start late by
// different amounts and a tune loses its timing. The receivers' chip is
// emulated to the cycle, so the delay is there as it is on the machine.
//
// What programs do about it. For two frames (of 20 ms) before a note they
// clear the voice's gate and write 0 to its attack and decay and its
// sustain and release. Rate 0 has the shortest period, 9 cycles, so
// whatever the counter held it wraps within the two frames and then stays
// below every period, and the envelope has released to silence. The
// note's own envelope and its gate, written next, start its attack at
// once.
//
// What it costs. The two frames: the voice's last note is cut short 40 ms
// before the next begins, and a sound is two frames longer for a note at
// its very start.

import { INSTRUMENT_BLOCK_MS } from "./instrument-profile.ts";
import type { Synth6581Control, Synth6581Envelope, Synth6581Image, Synth6581Voice } from "./synth6581-image.ts";
import type { Synth6581Track } from "./synth6581-track.ts";

/** The frames of 20 ms a voice is held restarting before its note: the counter wraps within 33 ms, so two. */
export const SYNTH6581_HARD_RESTART_FRAMES = 2;

/** How long a voice is held restarting before its note, in milliseconds. */
export const SYNTH6581_HARD_RESTART_MS = SYNTH6581_HARD_RESTART_FRAMES * INSTRUMENT_BLOCK_MS;

/** A note for one voice. */
export interface Synth6581Note extends Synth6581Envelope {
  readonly voice: Synth6581Voice;
  /** The frequency register's value (`synth6581Frequency` gives a pitch's). */
  readonly frequency: number;
  /** The waveform and the other control bits; the gate is set whatever this says. */
  readonly waveform: Synth6581Control;
  /** The pulse width, for a pulse waveform; left as the image has it when absent. */
  readonly pulseWidth?: number;
}

/** Sets a voice restarting on `image`: its gate clear, its waveform kept, and its attack, decay, sustain and release 0. A program that steps several voices itself pushes the image for SYNTH6581_HARD_RESTART_MS before it starts the note. */
export function synth6581HardRestart(image: Synth6581Image, voice: Synth6581Voice): void {
  image.gate(voice, false).envelope(voice, { attack: 0, decay: 0, sustain: 0, release: 0 });
}

/** Starts `note` on `image`: its frequency, pulse width and envelope, and its waveform with the gate set. */
export function synth6581Gate(image: Synth6581Image, note: Synth6581Note): void {
  image.frequency(note.voice, note.frequency);
  if (note.pulseWidth !== undefined) {
    image.pulseWidth(note.voice, note.pulseWidth);
  }
  image.envelope(note.voice, note).control(note.voice, { ...note.waveform, gate: true });
}

/** Plays `note` with a hard restart: pushes `image` with the voice restarting for two frames (40 ms, whatever the track's step), then with the note started for one step. The other voices sound through it as `image` has them. The note sounds until the program clears its gate (`image.gate(voice, false)`) and pushes again. */
export function synth6581Note(track: Synth6581Track, image: Synth6581Image, note: Synth6581Note): void {
  synth6581HardRestart(image, note.voice);
  track.push(image, SYNTH6581_HARD_RESTART_FRAMES * track.imagesPerBlock);
  synth6581Gate(image, note);
  track.push(image);
}
