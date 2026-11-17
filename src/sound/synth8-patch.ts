// One synth8 patch packed from its panel by name (DEC-6429): the 43
// bytes of the engine's synth8::Patch, one for each control in the order
// of Roland's Jupiter-8/System-8 Parameter Correspondence Table. A slider
// is 0 to 255; a control that modulates is signed, -128 to 127, 0 none,
// and written with 128 added; a switch or selector names its position.
// A synth8 sound plays two patches, the upper and the lower, which its
// bank holds side by side.

import { SYNTH_PATCH_BYTES } from "./instrument-profile.ts";
import { onOff, position, whole } from "./patch-field.ts";
import { SYNTH8_VCO2_RANGE } from "./synth-patch-tables.ts";

/** A slider's largest value, and what a signed control holds for none. */
const SLIDER_MOST = 255;
const SIGNED_ZERO = 128;
const SIGNED_LEAST = -SIGNED_ZERO;
const SIGNED_MOST = SLIDER_MOST - SIGNED_ZERO;

/** A synth8 patch: one half of the instrument's panel. */
export interface Synth8Patch {
  /** LFO: RATE and DELAY TIME, 0 to 255, and WAVEFORM. */
  readonly lfoRate: number;
  readonly lfoDelay: number;
  readonly lfoWaveform: "sine" | "sawtooth" | "square" | "random";
  /** VCO MODULATOR: LFO MOD and ENV MOD, -128 to 127, and whether they reach VCO-1 and VCO-2. */
  readonly vcoLfoMod: number;
  readonly vcoEnvMod: number;
  readonly vcoModulatorToVco1: boolean;
  readonly vcoModulatorToVco2: boolean;
  /** PULSE WIDTH MODULATION, 0 to 255, and what moves it. */
  readonly pulseWidthModulation: number;
  readonly pwmSource: "lfo" | "manual" | "env-1";
  /** VCO-1: CROSS MOD, 0 to 255, RANGE in feet and WAVEFORM. */
  readonly vco1CrossMod: number;
  readonly vco1Range: 16 | 8 | 4 | 2;
  readonly vco1Waveform: "triangle" | "sawtooth" | "pulse" | "square";
  /** VCO-2: SYNC, LOW FREQ, RANGE in semitones above 16' (0 to 36), FINE TUNE (-128 to 127) and WAVEFORM. */
  readonly vco2Sync: boolean;
  readonly vco2LowFrequency: boolean;
  readonly vco2Range: number;
  readonly vco2FineTune: number;
  readonly vco2Waveform: "sine" | "sawtooth" | "pulse" | "noise";
  /** The SOURCE MIX's two levels, 0 to 255. */
  readonly mixVco1: number;
  readonly mixVco2: number;
  /** HPF CUTOFF FREQ, VCF CUTOFF FREQ and VCF RESONANCE, 0 to 255. */
  readonly hpfCutoff: number;
  readonly vcfCutoff: number;
  readonly vcfResonance: number;
  /** VCF SLOPE: 24 or 12 dB an octave. */
  readonly vcfSlope: 24 | 12;
  /** VCF ENV MOD, -128 to 127, and the envelope that moves it, ENV-1 or ENV-2. */
  readonly vcfEnvMod: number;
  readonly vcfEnvelope: 1 | 2;
  /** VCF LFO MOD and KEY FOLLOW, -128 to 127. */
  readonly vcfLfoMod: number;
  readonly vcfKeyFollow: number;
  /** VCA LEVEL, 0 to 255, and VCA LFO MOD, -128 to 127. */
  readonly vcaLevel: number;
  readonly vcaLfoMod: number;
  /** ENV-1: A, D, S and R, 0 to 255, and its polarity. */
  readonly env1Attack: number;
  readonly env1Decay: number;
  readonly env1Sustain: number;
  readonly env1Release: number;
  readonly env1Polarity: "normal" | "inverted";
  /** ENV-2: A, D, S and R, 0 to 255. */
  readonly env2Attack: number;
  readonly env2Decay: number;
  readonly env2Sustain: number;
  readonly env2Release: number;
  /** ASSIGN MODE. */
  readonly assignMode: "poly-1" | "solo" | "unison" | "poly-2";
  /** KEY FOLLOW of ENV-1 and ENV-2. */
  readonly env1KeyFollow: boolean;
  readonly env2KeyFollow: boolean;
  /** Whether the BENDER moves VCO-1 and VCO-2. */
  readonly benderToVco1: boolean;
  readonly benderToVco2: boolean;
}

/** A slider's byte: 0 to 255. */
function slider(name: string, value: number): number {
  return whole("synth8", name, value, 0, SLIDER_MOST);
}

/** A signed control's byte: -128 to 127, with 128 added. */
function signed(name: string, value: number): number {
  return whole("synth8", name, value, SIGNED_LEAST, SIGNED_MOST) + SIGNED_ZERO;
}

/** A switch's byte: 1 on, 0 off. */
function on(name: string, value: boolean): number {
  return onOff("synth8", name, value) ? 1 : 0;
}

/** Every field's byte, in the order of the bytes. */
const FIELDS: readonly ((patch: Synth8Patch) => number)[] = [
  (patch) => slider("lfoRate", patch.lfoRate),
  (patch) => slider("lfoDelay", patch.lfoDelay),
  (patch) => position("synth8", "lfoWaveform", patch.lfoWaveform, ["sine", "sawtooth", "square", "random"]),
  (patch) => signed("vcoLfoMod", patch.vcoLfoMod),
  (patch) => signed("vcoEnvMod", patch.vcoEnvMod),
  (patch) => on("vcoModulatorToVco1", patch.vcoModulatorToVco1),
  (patch) => on("vcoModulatorToVco2", patch.vcoModulatorToVco2),
  (patch) => slider("pulseWidthModulation", patch.pulseWidthModulation),
  (patch) => position("synth8", "pwmSource", patch.pwmSource, ["lfo", "manual", "env-1"]),
  (patch) => slider("vco1CrossMod", patch.vco1CrossMod),
  (patch) => position("synth8", "vco1Range", patch.vco1Range, [16, 8, 4, 2]),
  (patch) => position("synth8", "vco1Waveform", patch.vco1Waveform, ["triangle", "sawtooth", "pulse", "square"]),
  (patch) => on("vco2Sync", patch.vco2Sync),
  (patch) => on("vco2LowFrequency", patch.vco2LowFrequency),
  (patch) => whole("synth8", "vco2Range", patch.vco2Range, 0, SYNTH8_VCO2_RANGE),
  (patch) => signed("vco2FineTune", patch.vco2FineTune),
  (patch) => position("synth8", "vco2Waveform", patch.vco2Waveform, ["sine", "sawtooth", "pulse", "noise"]),
  (patch) => slider("mixVco1", patch.mixVco1),
  (patch) => slider("mixVco2", patch.mixVco2),
  (patch) => slider("hpfCutoff", patch.hpfCutoff),
  (patch) => slider("vcfCutoff", patch.vcfCutoff),
  (patch) => slider("vcfResonance", patch.vcfResonance),
  (patch) => position("synth8", "vcfSlope", patch.vcfSlope, [24, 12]),
  (patch) => signed("vcfEnvMod", patch.vcfEnvMod),
  (patch) => position("synth8", "vcfEnvelope", patch.vcfEnvelope, [1, 2]),
  (patch) => signed("vcfLfoMod", patch.vcfLfoMod),
  (patch) => signed("vcfKeyFollow", patch.vcfKeyFollow),
  (patch) => slider("vcaLevel", patch.vcaLevel),
  (patch) => signed("vcaLfoMod", patch.vcaLfoMod),
  (patch) => slider("env1Attack", patch.env1Attack),
  (patch) => slider("env1Decay", patch.env1Decay),
  (patch) => slider("env1Sustain", patch.env1Sustain),
  (patch) => slider("env1Release", patch.env1Release),
  (patch) => position("synth8", "env1Polarity", patch.env1Polarity, ["normal", "inverted"]),
  (patch) => slider("env2Attack", patch.env2Attack),
  (patch) => slider("env2Decay", patch.env2Decay),
  (patch) => slider("env2Sustain", patch.env2Sustain),
  (patch) => slider("env2Release", patch.env2Release),
  (patch) => position("synth8", "assignMode", patch.assignMode, ["poly-1", "solo", "unison", "poly-2"]),
  (patch) => on("env1KeyFollow", patch.env1KeyFollow),
  (patch) => on("env2KeyFollow", patch.env2KeyFollow),
  (patch) => on("benderToVco1", patch.benderToVco1),
  (patch) => on("benderToVco2", patch.benderToVco2),
];

if (FIELDS.length !== SYNTH_PATCH_BYTES.synth8) {
  throw new RangeError("synth8: a field for every byte");
}

/** The engine's synth8::Patch::DEFAULT, the owner's manual's basic tuning patch: VCO-1's sawtooth alone at 8' through an open filter, the amplifier's envelope at full sustain, no modulation. */
export const synth8InitPatch: Synth8Patch = {
  lfoRate: 0,
  lfoDelay: 0,
  lfoWaveform: "sine",
  vcoLfoMod: 0,
  vcoEnvMod: 0,
  vcoModulatorToVco1: true,
  vcoModulatorToVco2: true,
  pulseWidthModulation: 0,
  pwmSource: "manual",
  vco1CrossMod: 0,
  vco1Range: 8,
  vco1Waveform: "sawtooth",
  vco2Sync: false,
  vco2LowFrequency: false,
  vco2Range: 12,
  vco2FineTune: 0,
  vco2Waveform: "sawtooth",
  mixVco1: SLIDER_MOST,
  mixVco2: 0,
  hpfCutoff: 0,
  vcfCutoff: SLIDER_MOST,
  vcfResonance: 0,
  vcfSlope: 24,
  vcfEnvMod: 0,
  vcfEnvelope: 1,
  vcfLfoMod: 0,
  vcfKeyFollow: 0,
  vcaLevel: 192,
  vcaLfoMod: 0,
  env1Attack: 0,
  env1Decay: 0,
  env1Sustain: SLIDER_MOST,
  env1Release: 0,
  env1Polarity: "normal",
  env2Attack: 0,
  env2Decay: 0,
  env2Sustain: SLIDER_MOST,
  env2Release: 0,
  assignMode: "poly-1",
  env1KeyFollow: false,
  env2KeyFollow: false,
  benderToVco1: true,
  benderToVco2: true,
};

/** The patch's 43 bytes, every field checked: a RangeError names a field out of its range. */
export function packSynth8Patch(patch: Synth8Patch): Uint8Array {
  return Uint8Array.from(FIELDS, (field) => field(patch));
}
