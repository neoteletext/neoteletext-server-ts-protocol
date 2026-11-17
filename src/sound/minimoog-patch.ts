// One Minimoog patch packed from its panel by name (DEC-6429): the 36
// bytes of the engine's minimoog::Patch, in the units the dials are marked
// in. The instrument has no patch memory; this is the engine's own layout
// of its sound chart (minimoog/patch.rs has the table), numbers of two
// bytes with the low byte first.

import { SYNTH_PATCH_BYTES } from "./instrument-profile.ts";
import { onOff, position, whole } from "./patch-field.ts";
import { MINIMOOG_CUTOFF, MINIMOOG_FREQUENCY_CENTS, MINIMOOG_KNOB, MINIMOOG_TIME_MS, MINIMOOG_TUNE_CENTS } from "./synth-patch-tables.ts";

/** An oscillator's RANGE switch, LO then in feet (owner's manual, page 4: "its 6 positions"). */
export type MinimoogRange = "LO" | 32 | 16 | 8 | 4 | 2;

/** A WAVEFORM switch's positions from the left: on oscillator 3 the second is a reversed sawtooth rather than the triangle-sawtooth. */
export type MinimoogWaveform = "triangle" | "triangle-sawtooth" | "sawtooth" | "square" | "wide-rectangular" | "narrow-rectangular";

/** Oscillator 1: its RANGE and WAVEFORM, and the mixer's VOLUME and switch for it. */
export interface MinimoogOscillator {
  readonly range: MinimoogRange;
  readonly waveform: MinimoogWaveform;
  /** The mixer's VOLUME, 0 to 100: tenths of the dial's 0 to 10. */
  readonly volume: number;
  /** The mixer's switch. */
  readonly on: boolean;
}

/** Oscillator 2 or 3: oscillator 1's controls and its FREQUENCY knob. */
export interface MinimoogTunedOscillator extends MinimoogOscillator {
  /** FREQUENCY, in cents from the key's pitch, -700 to 700. */
  readonly frequency: number;
}

/** A contour generator's dials. */
export interface MinimoogContour {
  /** ATTACK TIME and DECAY TIME, in milliseconds as the dials are marked, 0 to 10,000. */
  readonly attackMs: number;
  readonly decayMs: number;
  /** SUSTAIN LEVEL, 0 to 100. */
  readonly sustain: number;
}

/** A Minimoog patch: every knob and switch of the panel. A knob marked 0 to 10 is 0 to 100, in tenths. */
export interface MinimoogPatch {
  /** TUNE, in cents, -242 to 242. */
  readonly tune: number;
  /** GLIDE, 0 to 100. */
  readonly glide: number;
  /** MODULATION MIX, 0 to 100: oscillator 3 at 0, noise at 100. */
  readonly modulationMix: number;
  /** OSCILLATOR MODULATION. */
  readonly oscillatorModulation: boolean;
  readonly oscillator1: MinimoogOscillator;
  readonly oscillator2: MinimoogTunedOscillator;
  readonly oscillator3: MinimoogTunedOscillator;
  /** OSC. 3 CONTROL: the keyboard moves oscillator 3. */
  readonly oscillator3Control: boolean;
  /** EXTERNAL INPUT VOLUME and its switch: the instrument's own output fed back, as a cord from the main output to the external input does. */
  readonly externalVolume: number;
  readonly externalOn: boolean;
  /** NOISE VOLUME, its switch, and the noise's colour. */
  readonly noiseVolume: number;
  readonly noiseOn: boolean;
  readonly noise: "white" | "pink";
  /** CUTOFF FREQUENCY, in hundredths of the dial's -5 to 5: -500 to 500. */
  readonly cutoff: number;
  /** EMPHASIS and AMOUNT OF CONTOUR, 0 to 100. */
  readonly emphasis: number;
  readonly contourAmount: number;
  /** FILTER MODULATION, and KEYBOARD CONTROL 1 and 2: a third and two thirds of the keyboard's pitch. */
  readonly filterModulation: boolean;
  readonly keyboardControl1: boolean;
  readonly keyboardControl2: boolean;
  readonly filterContour: MinimoogContour;
  readonly loudnessContour: MinimoogContour;
  /** The main output's VOLUME, 0 to 100. */
  readonly volume: number;
  /** The GLIDE and DECAY switches beside the wheels. */
  readonly glideOn: boolean;
  readonly decayOn: boolean;
}

/** The engine's minimoog::Patch::DEFAULT: oscillator 1 alone, a sawtooth at 8', through the filter wide open, the loudness contour as an organ's. */
export const minimoogInitPatch: MinimoogPatch = {
  tune: 0,
  glide: 0,
  modulationMix: 0,
  oscillatorModulation: false,
  oscillator1: { range: 8, waveform: "sawtooth", volume: MINIMOOG_KNOB, on: true },
  oscillator2: { range: 8, waveform: "sawtooth", volume: MINIMOOG_KNOB, on: false, frequency: 0 },
  oscillator3: { range: "LO", waveform: "triangle", volume: MINIMOOG_KNOB, on: false, frequency: 0 },
  oscillator3Control: true,
  externalVolume: 0,
  externalOn: false,
  noiseVolume: 0,
  noiseOn: false,
  noise: "white",
  cutoff: MINIMOOG_CUTOFF,
  emphasis: 0,
  contourAmount: 0,
  filterModulation: false,
  keyboardControl1: false,
  keyboardControl2: false,
  filterContour: { attackMs: 0, decayMs: 0, sustain: MINIMOOG_KNOB },
  loudnessContour: { attackMs: 0, decayMs: 0, sustain: MINIMOOG_KNOB },
  volume: MINIMOOG_KNOB,
  glideOn: false,
  decayOn: false,
};

const RANGES: readonly MinimoogRange[] = ["LO", 32, 16, 8, 4, 2];
const WAVEFORMS: readonly MinimoogWaveform[] = ["triangle", "triangle-sawtooth", "sawtooth", "square", "wide-rectangular", "narrow-rectangular"];

/** The two switch bytes' bits (the engine's minimoog::patch::switch). */
const Switch = {
  OscillatorModulation: 1,
  Oscillator3Control: 1 << 1,
  Mix1: 1 << 2,
  Mix2: 1 << 3,
  Mix3: 1 << 4,
  MixExternal: 1 << 5,
  MixNoise: 1 << 6,
  NoisePink: 1,
  FilterModulation: 1 << 1,
  KeyboardControl1: 1 << 2,
  KeyboardControl2: 1 << 3,
  Glide: 1 << 4,
  Decay: 1 << 5,
} as const;

/** The bytes of a two-byte number. */
const WORD = 2;

/** Writes the patch's bytes in order, each field checked as it goes. */
class Writer {
  readonly bytes = new Uint8Array(SYNTH_PATCH_BYTES.minimoog);
  #at = 0;

  byte(value: number): void {
    this.bytes[this.#at] = value;
    this.#at += 1;
  }

  knob(name: string, value: number): void {
    this.byte(whole("minimoog", name, value, 0, MINIMOOG_KNOB));
  }

  signed(name: string, value: number, most: number): void {
    new DataView(this.bytes.buffer).setInt16(this.#at, whole("minimoog", name, value, -most, most), true);
    this.#at += WORD;
  }

  time(name: string, value: number): void {
    new DataView(this.bytes.buffer).setUint16(this.#at, whole("minimoog", name, value, 0, MINIMOOG_TIME_MS), true);
    this.#at += WORD;
  }

  switches(named: readonly (readonly [string, boolean, number])[]): void {
    this.byte(named.reduce((byte, [name, on, bit]) => byte | (onOff("minimoog", name, on) ? bit : 0), 0));
  }

  oscillator(name: string, oscillator: MinimoogOscillator): void {
    this.byte(position("minimoog", `${name}.range`, oscillator.range, RANGES));
    this.byte(position("minimoog", `${name}.waveform`, oscillator.waveform, WAVEFORMS));
  }

  contour(name: string, contour: MinimoogContour): void {
    this.time(`${name}.attackMs`, contour.attackMs);
    this.time(`${name}.decayMs`, contour.decayMs);
    this.knob(`${name}.sustain`, contour.sustain);
  }
}

/** The patch's 36 bytes, every field checked: a RangeError names a field out of its range. */
export function packMinimoogPatch(patch: MinimoogPatch): Uint8Array {
  const writer = new Writer();
  writer.signed("tune", patch.tune, MINIMOOG_TUNE_CENTS);
  writer.knob("glide", patch.glide);
  writer.knob("modulationMix", patch.modulationMix);
  writer.oscillator("oscillator1", patch.oscillator1);
  writer.oscillator("oscillator2", patch.oscillator2);
  writer.signed("oscillator2.frequency", patch.oscillator2.frequency, MINIMOOG_FREQUENCY_CENTS);
  writer.oscillator("oscillator3", patch.oscillator3);
  writer.signed("oscillator3.frequency", patch.oscillator3.frequency, MINIMOOG_FREQUENCY_CENTS);
  writer.knob("oscillator1.volume", patch.oscillator1.volume);
  writer.knob("oscillator2.volume", patch.oscillator2.volume);
  writer.knob("oscillator3.volume", patch.oscillator3.volume);
  writer.knob("externalVolume", patch.externalVolume);
  writer.knob("noiseVolume", patch.noiseVolume);
  writer.signed("cutoff", patch.cutoff, MINIMOOG_CUTOFF);
  writer.knob("emphasis", patch.emphasis);
  writer.knob("contourAmount", patch.contourAmount);
  writer.contour("filterContour", patch.filterContour);
  writer.contour("loudnessContour", patch.loudnessContour);
  writer.knob("volume", patch.volume);
  writer.switches([
    ["oscillatorModulation", patch.oscillatorModulation, Switch.OscillatorModulation],
    ["oscillator3Control", patch.oscillator3Control, Switch.Oscillator3Control],
    ["oscillator1.on", patch.oscillator1.on, Switch.Mix1],
    ["oscillator2.on", patch.oscillator2.on, Switch.Mix2],
    ["oscillator3.on", patch.oscillator3.on, Switch.Mix3],
    ["externalOn", patch.externalOn, Switch.MixExternal],
    ["noiseOn", patch.noiseOn, Switch.MixNoise],
  ]);
  writer.switches([
    ["noise is pink", position("minimoog", "noise", patch.noise, ["white", "pink"]) === 1, Switch.NoisePink],
    ["filterModulation", patch.filterModulation, Switch.FilterModulation],
    ["keyboardControl1", patch.keyboardControl1, Switch.KeyboardControl1],
    ["keyboardControl2", patch.keyboardControl2, Switch.KeyboardControl2],
    ["glideOn", patch.glideOn, Switch.Glide],
    ["decayOn", patch.decayOn, Switch.Decay],
  ]);
  return writer.bytes;
}
