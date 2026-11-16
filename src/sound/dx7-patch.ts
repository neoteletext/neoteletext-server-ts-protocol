// One DX7 patch packed from its parameters by name (REQ-6414 item 3):
// the 128 bytes a bank holds for each voice, in the layout of Yamaha's
// DX7 MIDI data format sheet ("Bulk dump packed format"). Operator 6 is
// stored first, 17 bytes an operator; then the pitch envelope, the
// algorithm and feedback, the LFO, the transpose and the name. Every
// parameter is held to its range, so no byte passes 127 and no field
// spills into its neighbour.

import { DX7_PATCH_BYTES } from "./instrument-profile.ts";

/** Four rates or four levels of an envelope, each 0 to 99. */
export type Dx7Four = readonly [number, number, number, number];

/** One of a patch's six operators. */
export interface Dx7Operator {
  /** The envelope's rates 1 to 4, each 0 to 99. */
  readonly rates: Dx7Four;
  /** The envelope's levels 1 to 4, each 0 to 99. */
  readonly levels: Dx7Four;
  /** Keyboard level scaling's break point, 0 to 99: 39 is C3. */
  readonly breakPoint: number;
  /** Scaling's depth left and right of the break point, 0 to 99. */
  readonly leftDepth: number;
  readonly rightDepth: number;
  /** Scaling's curves, 0 to 3: -linear, -exponential, +exponential, +linear. */
  readonly leftCurve: number;
  readonly rightCurve: number;
  /** Keyboard rate scaling, 0 to 7. */
  readonly rateScaling: number;
  /** Amplitude modulation sensitivity, 0 to 3. */
  readonly ampModSensitivity: number;
  /** Key velocity sensitivity, 0 to 7. */
  readonly keyVelocitySensitivity: number;
  /** Output level, 0 to 99. */
  readonly outputLevel: number;
  /** A ratio of the key's pitch, or a fixed frequency. */
  readonly mode: "ratio" | "fixed";
  /** Frequency coarse, 0 to 31. */
  readonly coarse: number;
  /** Frequency fine, 0 to 99. */
  readonly fine: number;
  /** Detune, 0 to 14: 7 is none, 0 is -7. */
  readonly detune: number;
}

/** A patch's parameters, as the instrument's panel names them. */
export interface Dx7Patch {
  /** Operators 1 to 6, in that order. */
  readonly operators: readonly [Dx7Operator, Dx7Operator, Dx7Operator, Dx7Operator, Dx7Operator, Dx7Operator];
  /** The pitch envelope's rates and levels, each 0 to 99; a level of 50 is no shift. */
  readonly pitchRates: Dx7Four;
  readonly pitchLevels: Dx7Four;
  /** The algorithm, 1 to 32 as the instrument numbers them. */
  readonly algorithm: number;
  /** Feedback, 0 to 7. */
  readonly feedback: number;
  readonly oscillatorKeySync: boolean;
  /** The LFO's speed and delay, and its pitch and amplitude modulation depths, each 0 to 99. */
  readonly lfoSpeed: number;
  readonly lfoDelay: number;
  readonly pitchModDepth: number;
  readonly ampModDepth: number;
  readonly lfoKeySync: boolean;
  /** The LFO's wave, 0 to 5: triangle, saw down, saw up, square, sine, sample and hold. */
  readonly lfoWave: number;
  /** Pitch modulation sensitivity, 0 to 7. */
  readonly pitchModSensitivity: number;
  /** Transpose, 0 to 48 semitones: 24 is C3, no transposition. */
  readonly transpose: number;
  /** The name, at most 10 printable ASCII characters. */
  readonly name: string;
}

/** The bytes of one operator, and the operators of a patch. */
const OPERATOR_BYTES = 17;
const OPERATORS = 6;
/** An operator's bytes after its four rates and four levels. */
const BREAK_POINT = 8;
const CURVES = 11;
const SCALING_DETUNE = 12;
const SENSITIVITIES = 13;
const OUTPUT_LEVEL = 14;
const MODE_COARSE = 15;
const FINE = 16;
/** A patch's bytes after its operators. */
const PITCH_RATES = OPERATORS * OPERATOR_BYTES;
const PITCH_LEVELS = PITCH_RATES + 4;
const ALGORITHM = 110;
const FEEDBACK_SYNC = 111;
const LFO = 112;
const LFO_WAVE = 116;
const TRANSPOSE = 117;
const NAME = 118;
const NAME_CHARACTERS = DX7_PATCH_BYTES - NAME;

/** The ranges of the instrument's parameters. */
const MOST = {
  level: 99,
  curve: 3,
  rateScaling: 7,
  ampModSensitivity: 3,
  sensitivity: 7,
  coarse: 31,
  detune: 14,
  feedback: 7,
  wave: 5,
  transpose: 48,
} as const;
const ALGORITHMS = 32;
/** Where the fields that share a byte begin, in bits. */
const RIGHT_CURVE_SHIFT = 2;
const DETUNE_SHIFT = 3;
const VELOCITY_SHIFT = 2;
const COARSE_SHIFT = 1;
const KEY_SYNC_SHIFT = 3;
const WAVE_SHIFT = 1;
const PITCH_SENSITIVITY_SHIFT = 4;
/** Printable ASCII: the space to the tilde. */
const PRINTABLE = /^[ -~]*$/u;
const SPACE = 0x20;

function wholeIn(name: string, value: number, most: number, least = 0): number {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`dx7 patch: ${name} is ${least} to ${most}, not ${value}`);
  }
  return value;
}

function four(name: string, values: readonly number[]): number[] {
  if (values.length !== 4) {
    throw new RangeError(`dx7 patch: ${name} are four, not ${values.length}`);
  }
  return values.map((value, index) => wholeIn(`${name} ${index + 1}`, value, MOST.level));
}

/** One operator's 17 bytes. */
function packOperator(of: string, operator: Dx7Operator): number[] {
  const bytes = [...four(`${of} rate`, operator.rates), ...four(`${of} level`, operator.levels)];
  bytes[BREAK_POINT] = wholeIn(`${of} break point`, operator.breakPoint, MOST.level);
  bytes[BREAK_POINT + 1] = wholeIn(`${of} left depth`, operator.leftDepth, MOST.level);
  bytes[BREAK_POINT + 2] = wholeIn(`${of} right depth`, operator.rightDepth, MOST.level);
  bytes[CURVES] =
    wholeIn(`${of} left curve`, operator.leftCurve, MOST.curve) | (wholeIn(`${of} right curve`, operator.rightCurve, MOST.curve) << RIGHT_CURVE_SHIFT);
  bytes[SCALING_DETUNE] =
    wholeIn(`${of} rate scaling`, operator.rateScaling, MOST.rateScaling) | (wholeIn(`${of} detune`, operator.detune, MOST.detune) << DETUNE_SHIFT);
  bytes[SENSITIVITIES] =
    wholeIn(`${of} amplitude modulation sensitivity`, operator.ampModSensitivity, MOST.ampModSensitivity) |
    (wholeIn(`${of} key velocity sensitivity`, operator.keyVelocitySensitivity, MOST.sensitivity) << VELOCITY_SHIFT);
  bytes[OUTPUT_LEVEL] = wholeIn(`${of} output level`, operator.outputLevel, MOST.level);
  if (operator.mode !== "ratio" && operator.mode !== "fixed") {
    throw new RangeError(`dx7 patch: ${of} mode is ratio or fixed, not ${String(operator.mode)}`);
  }
  bytes[MODE_COARSE] = (operator.mode === "fixed" ? 1 : 0) | (wholeIn(`${of} coarse`, operator.coarse, MOST.coarse) << COARSE_SHIFT);
  bytes[FINE] = wholeIn(`${of} fine`, operator.fine, MOST.level);
  return bytes;
}

/** The LFO's five bytes: speed, delay, the two depths, then key sync, wave and pitch modulation sensitivity in one. */
function packLfo(patch: Dx7Patch): number[] {
  return [
    wholeIn("LFO speed", patch.lfoSpeed, MOST.level),
    wholeIn("LFO delay", patch.lfoDelay, MOST.level),
    wholeIn("pitch modulation depth", patch.pitchModDepth, MOST.level),
    wholeIn("amplitude modulation depth", patch.ampModDepth, MOST.level),
    (patch.lfoKeySync ? 1 : 0) |
      (wholeIn("LFO wave", patch.lfoWave, MOST.wave) << WAVE_SHIFT) |
      (wholeIn("pitch modulation sensitivity", patch.pitchModSensitivity, MOST.sensitivity) << PITCH_SENSITIVITY_SHIFT),
  ];
}

/** The name's ten bytes, filled out with spaces. */
function packName(name: string): number[] {
  if (name.length > NAME_CHARACTERS || !PRINTABLE.test(name)) {
    throw new RangeError(`dx7 patch: a name is at most ${NAME_CHARACTERS} printable ASCII characters, not ${JSON.stringify(name)}`);
  }
  return Array.from(name.padEnd(NAME_CHARACTERS, " "), (character) => character.codePointAt(0) ?? SPACE);
}

/** A patch's 128 packed bytes, each parameter held to its range: one patch of what a `dx7Bank` member carries. */
export function packDx7Patch(patch: Dx7Patch): Uint8Array {
  const operators: readonly Dx7Operator[] = patch.operators;
  if (operators.length !== OPERATORS) {
    throw new RangeError(`dx7 patch: a patch has ${OPERATORS} operators, not ${operators.length}`);
  }
  const bytes = new Uint8Array(DX7_PATCH_BYTES);
  for (const [index, operator] of operators.entries()) {
    // Operator 6 is stored first, operator 1 last.
    bytes.set(packOperator(`operator ${index + 1}`, operator), (OPERATORS - 1 - index) * OPERATOR_BYTES);
  }
  bytes.set(four("pitch rate", patch.pitchRates), PITCH_RATES);
  bytes.set(four("pitch level", patch.pitchLevels), PITCH_LEVELS);
  bytes[ALGORITHM] = wholeIn("the algorithm", patch.algorithm, ALGORITHMS, 1) - 1;
  bytes[FEEDBACK_SYNC] = wholeIn("feedback", patch.feedback, MOST.feedback) | ((patch.oscillatorKeySync ? 1 : 0) << KEY_SYNC_SHIFT);
  bytes.set(packLfo(patch), LFO);
  bytes[TRANSPOSE] = wholeIn("transpose", patch.transpose, MOST.transpose);
  bytes.set(packName(patch.name), NAME);
  return bytes;
}

// The layout's offsets agree: the LFO's last byte is the wave's, and the pitch levels end where the algorithm begins.
if (LFO + 4 !== LFO_WAVE || PITCH_LEVELS + 4 !== ALGORITHM) {
  throw new RangeError("the DX7 patch layout's offsets disagree");
}

/** The instrument's own starting voice, INIT VOICE: one sine wave from operator 1. A patch is easiest made by changing a copy of it. */
export function dx7InitVoice(): Dx7Patch {
  const silent: Dx7Operator = {
    rates: [99, 99, 99, 99],
    levels: [99, 99, 99, 0],
    breakPoint: 39,
    leftDepth: 0,
    rightDepth: 0,
    leftCurve: 0,
    rightCurve: 0,
    rateScaling: 0,
    ampModSensitivity: 0,
    keyVelocitySensitivity: 0,
    outputLevel: 0,
    mode: "ratio",
    coarse: 1,
    fine: 0,
    detune: 7,
  };
  return {
    operators: [{ ...silent, outputLevel: 99 }, silent, silent, silent, silent, silent],
    pitchRates: [99, 99, 99, 99],
    pitchLevels: [50, 50, 50, 50],
    algorithm: 1,
    feedback: 0,
    oscillatorKeySync: true,
    lfoSpeed: 35,
    lfoDelay: 0,
    pitchModDepth: 0,
    ampModDepth: 0,
    lfoKeySync: true,
    lfoWave: 0,
    pitchModSensitivity: 3,
    transpose: 24,
    name: "INIT VOICE",
  };
}
