// One synth53 program packed from its panel by name (DEC-6429): the 24
// bytes of a program in the instrument's memory (Operation Manual,
// CM1000D, section 6-7, "Status 3: Save to tape"), each byte a knob in its
// low seven bits, 0 to 127 as the instrument's converter measures it, and
// a switch in its top bit; the last two bytes hold a knob alone.

import { SEVEN_BITS, SYNTH_PATCH_BYTES } from "./instrument-profile.ts";
import { onOff, whole } from "./patch-field.ts";
import { SYNTH53_SWITCH_BYTES } from "./synth-patch-tables.ts";

/** The knobs, each by the byte that holds it (the manual's table). */
const KNOBS = [
  "filterAttack",
  "filterDecay",
  "filterSustain",
  "filterRelease",
  "amplifierAttack",
  "amplifierDecay",
  "amplifierSustain",
  "amplifierRelease",
  "cutoff",
  "filterEnvelopeAmount",
  "mixerOscB",
  "oscBPulseWidth",
  "mixerOscA",
  "oscAPulseWidth",
  "mixerNoise",
  "resonance",
  "glide",
  "lfoFrequency",
  "wheelModSourceMix",
  "polyModOscB",
  "polyModFilterEnvelope",
  "oscAFrequency",
  "oscBFrequency",
  "oscBFine",
] as const;

/** The switches, each by the byte whose top bit holds it. */
const SWITCHES = [
  "oscAPulse",
  "oscASawtooth",
  "sync",
  "oscBSawtooth",
  "oscBTriangle",
  "oscBPulse",
  "oscBKeyboard",
  "unison",
  "polyModFrequencyA",
  "polyModPulseWidthA",
  "polyModFilter",
  "lfoSawtooth",
  "lfoTriangle",
  "lfoSquare",
  "filterKeyboard",
  "release",
  "wheelModFrequencyA",
  "wheelModFrequencyB",
  "wheelModPulseWidthA",
  "wheelModPulseWidthB",
  "wheelModFilter",
  "oscBLowFrequency",
] as const;

/** A knob of the panel, 0 to 127. */
export type Synth53Knob = (typeof KNOBS)[number];
/** A switch of the panel. */
export type Synth53Switch = (typeof SWITCHES)[number];

/** A synth53 program: every knob, 0 to 127, and every switch. Revision 3 is trimmed so that a dial's 10 is 120 (TM3 adjustment 4-14), so a dial's tenths are {@link synth53Dial}. */
export type Synth53Patch = { readonly [knob in Synth53Knob]: number } & { readonly [button in Synth53Switch]: boolean };

/** Revision 3's converter makes twelve steps of each mark of a dial, a mark being ten tenths (TM3 adjustment 4-14). */
const STEPS_A_MARK = 12;
const TENTHS_A_MARK = 10;

/** The number the converter makes of a knob at a position of its dial, given in tenths of the dial's 0 to 10: twelve steps to each mark (the engine's synth53::dial). */
export function synth53Dial(tenths: number): number {
  return Math.min(SEVEN_BITS, Math.round((whole("synth53", "a dial", tenths, 0, Number.MAX_SAFE_INTEGER) * STEPS_A_MARK) / TENTHS_A_MARK));
}

/** A synth52 program: the synth53's, whose layout it shares. */
export type Synth52Patch = Synth53Patch;

/** A synth51 program: the synth53's, whose layout it shares. */
export type Synth51Patch = Synth53Patch;

/** A knob at the middle of its travel, as the engine's default sets it: KNOB_MAX / 2 + 1. */
const MIDDLE = 64;

/** The engine's synth53::Patch::DEFAULT: oscillator A's sawtooth through an open filter that follows the keys, both envelopes at full sustain, the release switch on. */
export const synth53InitPatch: Synth53Patch = {
  filterAttack: 0,
  filterDecay: 0,
  filterSustain: SEVEN_BITS,
  filterRelease: 0,
  amplifierAttack: 0,
  amplifierDecay: 0,
  amplifierSustain: SEVEN_BITS,
  amplifierRelease: 0,
  cutoff: SEVEN_BITS,
  filterEnvelopeAmount: 0,
  mixerOscB: 0,
  oscBPulseWidth: MIDDLE,
  mixerOscA: SEVEN_BITS,
  oscAPulseWidth: MIDDLE,
  mixerNoise: 0,
  resonance: 0,
  glide: 0,
  lfoFrequency: 0,
  wheelModSourceMix: 0,
  polyModOscB: 0,
  polyModFilterEnvelope: 0,
  oscAFrequency: MIDDLE,
  oscBFrequency: MIDDLE,
  oscBFine: 0,
  oscAPulse: false,
  oscASawtooth: true,
  sync: false,
  oscBSawtooth: false,
  oscBTriangle: false,
  oscBPulse: false,
  oscBKeyboard: true,
  unison: false,
  polyModFrequencyA: false,
  polyModPulseWidthA: false,
  polyModFilter: false,
  lfoSawtooth: false,
  lfoTriangle: true,
  lfoSquare: false,
  filterKeyboard: true,
  release: true,
  wheelModFrequencyA: false,
  wheelModFrequencyB: false,
  wheelModPulseWidthA: false,
  wheelModPulseWidthB: false,
  wheelModFilter: false,
  oscBLowFrequency: false,
};

/** A byte's switch bit (the manual: "the MSB represents a switch setting"). */
const SWITCH_BIT = 0x80;

/** The synth52's starting program: the synth53's. */
export const synth52InitPatch: Synth52Patch = { ...synth53InitPatch };

/** The synth51's starting program: the synth53's. */
export const synth51InitPatch: Synth51Patch = { ...synth53InitPatch };

if (KNOBS.length !== SYNTH_PATCH_BYTES.synth53 || SWITCHES.length !== SYNTH53_SWITCH_BYTES) {
  throw new RangeError("synth53: a knob in every byte and a switch in all but the last two");
}

/** The program's 24 bytes for `synth`, every field checked: a RangeError names a field out of its range. */
function pack(synth: "synth53" | "synth52" | "synth51", patch: Synth53Patch): Uint8Array {
  const bytes = new Uint8Array(SYNTH_PATCH_BYTES[synth]);
  for (const [at, knob] of KNOBS.entries()) {
    const button = SWITCHES[at];
    const on = button !== undefined && onOff(synth, button, patch[button]);
    bytes[at] = whole(synth, knob, patch[knob], 0, SEVEN_BITS) | (on ? SWITCH_BIT : 0);
  }
  return bytes;
}

/** A synth53 program's 24 bytes, every field checked: a RangeError names a field out of its range. */
export function packSynth53Patch(patch: Synth53Patch): Uint8Array {
  return pack("synth53", patch);
}

/** A synth52 program's 24 bytes, the synth53's layout, every field checked. */
export function packSynth52Patch(patch: Synth52Patch): Uint8Array {
  return pack("synth52", patch);
}

/** A synth51 program's 24 bytes, the synth53's layout, every field checked. */
export function packSynth51Patch(patch: Synth51Patch): Uint8Array {
  return pack("synth51", patch);
}
