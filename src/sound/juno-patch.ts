// One Juno patch packed from its panel by name (DEC-6429): the 18 bytes
// of the Juno-106's patch message (owner's manual, MIDI Implementation
// 3.1 to 3.4), sixteen sliders and two bytes of switches, which the
// engine reads for both the Juno-106 and the Juno-60. The Juno-60's own
// switch positions (both chorus buttons, the envelope moving the pulse
// width, the sub-oscillator switched off) have no byte, as the engine's
// juno::Patch says, and are not offered here.

import { SEVEN_BITS, SYNTH_PATCH_BYTES } from "./instrument-profile.ts";
import { onOff, position, whole } from "./patch-field.ts";
import { JUNO_FEET_BITS } from "./synth-patch-tables.ts";

/** The sliders, by the name the kit gives each: the Juno-106's sixteen, in their parameter numbers' order. */
const SLIDERS = [
  "lfoRate",
  "lfoDelay",
  "dcoLfo",
  "dcoPwm",
  "dcoNoise",
  "vcfFrequency",
  "vcfResonance",
  "vcfEnvelope",
  "vcfLfo",
  "vcfKeyboard",
  "vcaLevel",
  "envAttack",
  "envDecay",
  "envSustain",
  "envRelease",
  "dcoSub",
] as const;

/** A slider of the panel, each 0 to 127. */
export type JunoSlider = (typeof SLIDERS)[number];

/** The DCO's range, in feet. */
export type JunoRange = 16 | 8 | 4;

/** A Juno patch: the panel as the Juno-106's patch message holds it. */
export type JunoPatch = { readonly [slider in JunoSlider]: number } & {
  /** RANGE: 16', 8' or 4'. */
  readonly range: JunoRange;
  /** The DCO's pulse and sawtooth buttons. */
  readonly pulse: boolean;
  readonly sawtooth: boolean;
  /** CHORUS: off, I or II. */
  readonly chorus: "off" | "I" | "II";
  /** What moves the pulse's width: the LFO, or the DCO PWM slider alone (MAN). */
  readonly pwm: "lfo" | "manual";
  /** The VCF envelope's polarity: + opens the filter, - closes it. */
  readonly envelopePolarity: "+" | "-";
  /** What opens the VCA: the envelope, or the gate. */
  readonly vca: "env" | "gate";
  /** HPF: the switch's position, 0 to 3; position 0 is what the MIDI table calls off, and each above raises the cutoff. */
  readonly hpf: number;
};

/** A plain starting sound, the engine's juno::Patch::DEFAULT: a sawtooth at 8' through an open filter, no chorus, the envelope's sustain full. */
export const junoInitPatch: JunoPatch = {
  lfoRate: 0,
  lfoDelay: 0,
  dcoLfo: 0,
  dcoPwm: 0,
  dcoNoise: 0,
  vcfFrequency: SEVEN_BITS,
  vcfResonance: 0,
  vcfEnvelope: 0,
  vcfLfo: 0,
  vcfKeyboard: 0,
  vcaLevel: 64,
  envAttack: 0,
  envDecay: 0,
  envSustain: SEVEN_BITS,
  envRelease: 0,
  dcoSub: 0,
  range: 8,
  pulse: false,
  sawtooth: true,
  chorus: "off",
  pwm: "manual",
  envelopePolarity: "+",
  vca: "env",
  hpf: 1,
};

/** Byte 16's switch bits (MIDI Implementation 3.4, "for switches"): the pulse and sawtooth are on, the chorus is off, and the chorus, if on, is I. */
const PULSE_BIT = 1 << 3;
const SAWTOOTH_BIT = 1 << 4;
const CHORUS_OFF_BIT = 1 << 5;
const CHORUS_ONE_BIT = 1 << 6;
/** Byte 17's: the pulse width is manual, the envelope is inverted, the gate opens the VCA; bits 3 and 4 are three less the HPF's position. */
const PWM_MANUAL_BIT = 1;
const ENVELOPE_INVERTED_BIT = 1 << 1;
const VCA_GATE_BIT = 1 << 2;
const HPF_SHIFT = 3;
/** The HPF's last position. */
const HPF_MOST = 3;

const RANGES: readonly JunoRange[] = [16, 8, 4];
const CHORUS: readonly JunoPatch["chorus"][] = ["off", "I", "II"];

/** `value` if a switch is on, else 0. */
function bit(on: boolean, value: number): number {
  return on ? value : 0;
}

/** The patch's 18 bytes, every field checked: a RangeError names a field out of its range. */
export function packJunoPatch(patch: JunoPatch): Uint8Array {
  const bytes = new Uint8Array(SYNTH_PATCH_BYTES.juno);
  for (const [at, slider] of SLIDERS.entries()) {
    bytes[at] = whole("juno", slider, patch[slider], 0, SEVEN_BITS);
  }
  position("juno", "range", patch.range, RANGES);
  const range = JUNO_FEET_BITS[patch.range];
  const chorus = [CHORUS_OFF_BIT, CHORUS_ONE_BIT, 0][position("juno", "chorus", patch.chorus, CHORUS)] ?? 0;
  bytes[SLIDERS.length] = range | bit(onOff("juno", "pulse", patch.pulse), PULSE_BIT) | bit(onOff("juno", "sawtooth", patch.sawtooth), SAWTOOTH_BIT) | chorus;
  bytes[SLIDERS.length + 1] =
    bit(position("juno", "pwm", patch.pwm, ["lfo", "manual"]) === 1, PWM_MANUAL_BIT) |
    bit(position("juno", "envelopePolarity", patch.envelopePolarity, ["+", "-"]) === 1, ENVELOPE_INVERTED_BIT) |
    bit(position("juno", "vca", patch.vca, ["env", "gate"]) === 1, VCA_GATE_BIT) |
    ((HPF_MOST - whole("juno", "hpf", patch.hpf, 0, HPF_MOST)) << HPF_SHIFT);
  return bytes;
}
