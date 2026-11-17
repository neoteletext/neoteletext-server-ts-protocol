// One CS-80 patch packed from its panel by name (DEC-6429): the 85 bytes
// of the engine's cs80::Patch, channel I's tone, channel II's tone, then
// the 33 controls that belong to neither (cs80/patch.rs has the table). A
// lever is 0 to 127 from the end the panel marks low, slow, short or 0.

import { SEVEN_BITS, SYNTH_PATCH_BYTES } from "./instrument-profile.ts";
import { onOff, position, whole } from "./patch-field.ts";
import { CS80_TONE_BYTES } from "./synth-patch-tables.ts";

/** A tone's levers, by the byte that holds each, in the memory panel's order (owner's manual, page 36); bytes 3 and 4 are the square and sawtooth switches. */
const TONE_LEVERS = [
  ["pwmSpeed", 0],
  ["pwm", 1],
  ["pulseWidth", 2],
  ["noise", 5],
  ["hpf", 6],
  ["hpfResonance", 7],
  ["lpf", 8],
  ["lpfResonance", 9],
  ["initialLevel", 10],
  ["attackLevel", 11],
  ["filterAttack", 12],
  ["filterDecay", 13],
  ["filterRelease", 14],
  ["vcfLevel", 15],
  ["sine", 16],
  ["attack", 17],
  ["decay", 18],
  ["sustain", 19],
  ["release", 20],
  ["level", 21],
  ["initialBrilliance", 22],
  ["initialTouchLevel", 23],
  ["afterBrilliance", 24],
  ["afterLevel", 25],
] as const;
const SQUARE_BYTE = 3;
const SAWTOOTH_BYTE = 4;

/** A lever of a tone, 0 to 127: PWM SPEED, PWM, PW; NOISE; HPF and RESh, LPF and RESl; IL and AL; the filter's A, D and R; VCF LEVEL; SINE; the amplifier's A, D, S and R; LEVEL; and the touch response's INITIAL BRILLIANCE, INITIAL LEVEL, AFTER BRILLIANCE and AFTER LEVEL. */
export type Cs80Lever = (typeof TONE_LEVERS)[number][0];

/** One row of the panel: what a tone selector button recalls. */
export type Cs80Tone = { readonly [lever in Cs80Lever]: number } & {
  /** The square and sawtooth waves' switches. */
  readonly square: boolean;
  readonly sawtooth: boolean;
};

/** A channel's pitch, as an organ's stops are named (owner's manual, page 8, item 5). */
export type Cs80Feet = "16'" | "8'" | "5 1/3'" | "4'" | "2 2/3'" | "2'";

/** The sub oscillator's FUNCTION (owner's manual, page 9, item 11 A): "external" with nothing connected is its off. */
export type Cs80SubFunction = "sine" | "sawtooth" | "inverted-sawtooth" | "square" | "noise" | "external";

/** The levers outside the tones, by the byte after the two tones that holds each. */
const GLOBAL_LEVERS = [
  ["detune", 2],
  ["mix", 3],
  ["brilliance", 4],
  ["resonance", 5],
  ["keyboardBrillianceLow", 6],
  ["keyboardBrillianceHigh", 7],
  ["keyboardLevelLow", 8],
  ["keyboardLevelHigh", 9],
  ["subSpeed", 11],
  ["subVco", 12],
  ["subVcf", 13],
  ["subVca", 14],
  ["touchPitchBend", 15],
  ["touchSpeed", 16],
  ["touchVco", 17],
  ["touchVcf", 18],
  ["ringAttack", 19],
  ["ringDecay", 20],
  ["ringDepth", 21],
  ["ringSpeed", 22],
  ["ringModulation", 23],
  ["sustainTime", 25],
  ["glideTime", 27],
  ["effectSpeed", 31],
  ["effectDepth", 32],
] as const;

/** A lever outside the tones, 0 to 127: DETUNE CH II and MIX; the overall BRILLIANCE and RESONANCE; KEYBOARD CONTROL's four; the SUB OSCILLATOR's SPEED, VCO, VCF and VCA; TOUCH RESPONSE's PITCHBEND, SPEED, VCO and VCF; the RING MODULATOR's five; SUSTAIN; PORTAMENTO/GLISSANDO; and TREMOLO/CHORUS SPEED and DEPTH. */
export type Cs80GlobalLever = (typeof GLOBAL_LEVERS)[number][0];

/** The whole panel. */
export type Cs80Patch = { readonly [lever in Cs80GlobalLever]: number } & {
  /** The tones of channel I and channel II. */
  readonly tones: readonly [Cs80Tone, Cs80Tone];
  /** FEET of channel I and of channel II. */
  readonly feetI: Cs80Feet;
  readonly feetII: Cs80Feet;
  /** SUB OSCILLATOR FUNCTION. */
  readonly subFunction: Cs80SubFunction;
  /** SUSTAIN I or II. */
  readonly sustainMode: "I" | "II";
  /** PORTAMENTO or GLISSANDO. */
  readonly glideMode: "portamento" | "glissando";
  /** TREMOLO/CHORUS ON, and the CHORUS and TREMOLO switches. */
  readonly effectOn: boolean;
  readonly chorus: boolean;
  readonly tremolo: boolean;
};

const FEET: readonly Cs80Feet[] = ["16'", "8'", "5 1/3'", "4'", "2 2/3'", "2'"];
const SUB_FUNCTIONS: readonly Cs80SubFunction[] = ["sine", "sawtooth", "inverted-sawtooth", "square", "noise", "external"];
/** The bytes after the two tones of the selectors and switches. */
const Global = { FeetI: 0, FeetII: 1, SubFunction: 10, SustainMode: 24, GlideMode: 26, EffectOn: 28, Chorus: 29, Tremolo: 30 } as const;
/** A lever at rest in the middle of its travel (the engine's cs80::law::LEVER_CENTRE). */
const LEVER_CENTRE = 64;

/** The engine's cs80::Tone::DEFAULT: a sawtooth through open filters, the amplifier's envelope a gate, no touch response. */
export const cs80InitTone: Cs80Tone = {
  pwmSpeed: 0,
  pwm: 0,
  pulseWidth: 0,
  noise: 0,
  hpf: 0,
  hpfResonance: 0,
  lpf: SEVEN_BITS,
  lpfResonance: 0,
  initialLevel: 0,
  attackLevel: 0,
  filterAttack: 0,
  filterDecay: 0,
  filterRelease: 0,
  vcfLevel: SEVEN_BITS,
  sine: 0,
  attack: 0,
  decay: 0,
  sustain: SEVEN_BITS,
  release: 0,
  level: SEVEN_BITS,
  initialBrilliance: 0,
  initialTouchLevel: 0,
  afterBrilliance: 0,
  afterLevel: 0,
  square: false,
  sawtooth: true,
};

/** The engine's cs80::Patch::DEFAULT: the panel at rest, both channels at 8', channel I alone, the levers that rest at their centre there. */
export const cs80InitPatch: Cs80Patch = {
  detune: LEVER_CENTRE,
  mix: 0,
  brilliance: LEVER_CENTRE,
  resonance: 0,
  keyboardBrillianceLow: LEVER_CENTRE,
  keyboardBrillianceHigh: LEVER_CENTRE,
  keyboardLevelLow: LEVER_CENTRE,
  keyboardLevelHigh: LEVER_CENTRE,
  subSpeed: 0,
  subVco: 0,
  subVcf: 0,
  subVca: 0,
  touchPitchBend: 0,
  touchSpeed: 0,
  touchVco: 0,
  touchVcf: 0,
  ringAttack: 0,
  ringDecay: 0,
  ringDepth: 0,
  ringSpeed: 0,
  ringModulation: 0,
  sustainTime: 0,
  glideTime: 0,
  effectSpeed: 0,
  effectDepth: 0,
  tones: [cs80InitTone, cs80InitTone],
  feetI: "8'",
  feetII: "8'",
  subFunction: "sine",
  sustainMode: "I",
  glideMode: "portamento",
  effectOn: false,
  chorus: false,
  tremolo: false,
};

function tone(bytes: Uint8Array, at: number, name: string, levers: Cs80Tone): void {
  for (const [lever, offset] of TONE_LEVERS) {
    bytes[at + offset] = whole("cs80", `${name}.${lever}`, levers[lever], 0, SEVEN_BITS);
  }
  bytes[at + SQUARE_BYTE] = onOff("cs80", `${name}.square`, levers.square) ? 1 : 0;
  bytes[at + SAWTOOTH_BYTE] = onOff("cs80", `${name}.sawtooth`, levers.sawtooth) ? 1 : 0;
}

/** The patch's 85 bytes, every field checked: a RangeError names a field out of its range. */
export function packCs80Patch(patch: Cs80Patch): Uint8Array {
  const bytes = new Uint8Array(SYNTH_PATCH_BYTES.cs80);
  tone(bytes, 0, "tones[0]", patch.tones[0]);
  tone(bytes, CS80_TONE_BYTES, "tones[1]", patch.tones[1]);
  const globals = 2 * CS80_TONE_BYTES;
  for (const [lever, offset] of GLOBAL_LEVERS) {
    bytes[globals + offset] = whole("cs80", lever, patch[lever], 0, SEVEN_BITS);
  }
  const set = (offset: number, value: number): void => {
    bytes[globals + offset] = value;
  };
  set(Global.FeetI, position("cs80", "feetI", patch.feetI, FEET));
  set(Global.FeetII, position("cs80", "feetII", patch.feetII, FEET));
  set(Global.SubFunction, position("cs80", "subFunction", patch.subFunction, SUB_FUNCTIONS));
  set(Global.SustainMode, position("cs80", "sustainMode", patch.sustainMode, ["I", "II"]));
  set(Global.GlideMode, position("cs80", "glideMode", patch.glideMode, ["portamento", "glissando"]));
  set(Global.EffectOn, onOff("cs80", "effectOn", patch.effectOn) ? 1 : 0);
  set(Global.Chorus, onOff("cs80", "chorus", patch.chorus) ? 1 : 0);
  set(Global.Tremolo, onOff("cs80", "tremolo", patch.tremolo) ? 1 : 0);
  return bytes;
}
