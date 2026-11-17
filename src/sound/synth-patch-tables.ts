// The analogue synthesizers' patches as tables of fields (DEC-6429): each
// byte's control, as the instrument's panel names it, and its range. A
// port of the server's protocol/check/instrument/patch.rs at
// neoteletext-app-server 2df311a, which follows the engine's
// `<instrument>/patch.rs`; the rules that read them are
// synth-patch-rules.ts, and the packers name their bytes from them.

import { SEVEN_BITS, type Synth } from "./instrument-profile.ts";

/** What a field of a patch may hold. */
export type Range =
  /** One byte, 0 to `most`. */
  | { readonly byte: number }
  /** Two bytes, the low first, a signed number from -`most` to `most`. */
  | { readonly signed: number }
  /** Two bytes, the low first, 0 to `most`. */
  | { readonly word: number }
  /** One byte of switches: no bit outside the mask. */
  | { readonly bits: number }
  /** The Juno's first switch byte: seven bits, its three range bits exactly one of 16', 8' and 4'. */
  | { readonly junoFeet: true };

/** A field: its first byte, its control's name and its range. */
export type Field = readonly [at: number, name: string, range: Range];

/** Every value of a byte: the Prophet-5 keeps a knob in its low seven bits and a switch in its top bit, and a Jupiter-8 slider is a whole byte. */
const ANY = 0xff;
const seven: Range = { byte: SEVEN_BITS };
const any: Range = { byte: ANY };

/** The Juno's first switch byte's range bits, one each for 16', 8' and 4' (JUNO-106 owner's manual, MIDI Implementation 3.4). */
export const JUNO_FEET_BITS = { 16: 0b001, 8: 0b010, 4: 0b100 } as const;
export const JUNO_FEET_MASK = 0b111;
/** The Juno's second switch byte: PWM, ENV polarity, VCA mode and two bits of the high-pass filter. */
const JUNO_SWITCH_BITS = 0b1_1111;

/** The Juno-106's sliders, by parameter number (owner's manual, MIDI Implementation 3.4). */
const JUNO_SLIDERS = [
  "LFO RATE",
  "LFO DELAY TIME",
  "DCO LFO",
  "DCO PWM",
  "DCO NOISE",
  "VCF FREQ",
  "VCF RES",
  "VCF ENV",
  "VCF LFO",
  "VCF KYBD",
  "VCA LEVEL",
  "ENV A",
  "ENV D",
  "ENV S",
  "ENV R",
  "DCO SUB",
] as const;

const JUNO: readonly Field[] = [
  ...JUNO_SLIDERS.map((name, at): Field => [at, name, seven]),
  [16, "range, waveforms and chorus", { junoFeet: true }],
  [17, "PWM, ENV, VCA and HPF switches", { bits: JUNO_SWITCH_BITS }],
];

/** A Minimoog knob's largest value: tenths of its dial's 0 to 10. */
export const MINIMOOG_KNOB = 100;
/** A range or waveform switch's last position: six of each (owner's manual, page 4). */
const MINIMOOG_POSITION = 5;
/** TUNE's travel either way, in cents (the engine's minimoog::law). */
export const MINIMOOG_TUNE_CENTS = 242;
/** An oscillator's FREQUENCY travel either way, in cents: seven semitones. */
export const MINIMOOG_FREQUENCY_CENTS = 700;
/** CUTOFF FREQUENCY's ends: hundredths of the dial's -5 to 5. */
export const MINIMOOG_CUTOFF = 500;
/** A contour's longest time, in milliseconds: the dial's 10 seconds. */
export const MINIMOOG_TIME_MS = 10_000;
/** The first switch byte's bits: oscillator modulation, oscillator 3 control and the mixer's five switches. */
const MINIMOOG_FIRST_SWITCHES = (1 << 7) - 1;
/** The second's: pink noise, filter modulation, the two keyboard controls, glide and decay. */
const MINIMOOG_SECOND_SWITCHES = (1 << 6) - 1;

const knob: Range = { byte: MINIMOOG_KNOB };
const position: Range = { byte: MINIMOOG_POSITION };
const time: Range = { word: MINIMOOG_TIME_MS };

const MINIMOOG: readonly Field[] = [
  [0, "TUNE", { signed: MINIMOOG_TUNE_CENTS }],
  [2, "GLIDE", knob],
  [3, "MODULATION MIX", knob],
  [4, "OSCILLATOR 1 RANGE", position],
  [5, "OSCILLATOR 1 WAVEFORM", position],
  [6, "OSCILLATOR 2 RANGE", position],
  [7, "OSCILLATOR 2 WAVEFORM", position],
  [8, "OSCILLATOR 2 FREQUENCY", { signed: MINIMOOG_FREQUENCY_CENTS }],
  [10, "OSCILLATOR 3 RANGE", position],
  [11, "OSCILLATOR 3 WAVEFORM", position],
  [12, "OSCILLATOR 3 FREQUENCY", { signed: MINIMOOG_FREQUENCY_CENTS }],
  [14, "OSCILLATOR 1 VOLUME", knob],
  [15, "OSCILLATOR 2 VOLUME", knob],
  [16, "OSCILLATOR 3 VOLUME", knob],
  [17, "EXTERNAL INPUT VOLUME", knob],
  [18, "NOISE VOLUME", knob],
  [19, "CUTOFF FREQUENCY", { signed: MINIMOOG_CUTOFF }],
  [21, "EMPHASIS", knob],
  [22, "AMOUNT OF CONTOUR", knob],
  [23, "filter ATTACK TIME", time],
  [25, "filter DECAY TIME", time],
  [27, "filter SUSTAIN LEVEL", knob],
  [28, "loudness ATTACK TIME", time],
  [30, "loudness DECAY TIME", time],
  [32, "loudness SUSTAIN LEVEL", knob],
  [33, "main output VOLUME", knob],
  [34, "modulation and mixer switches", { bits: MINIMOOG_FIRST_SWITCHES }],
  [35, "noise, filter, keyboard, glide and decay switches", { bits: MINIMOOG_SECOND_SWITCHES }],
];

/** The Prophet-5's 24 bytes, each a knob in its low seven bits and a switch in its top bit, as the server names them (Operation Manual CM1000D, section 6-7). */
const PROPHET5_NAMES = [
  "FILTER ATTACK, OSC A PULSE",
  "FILTER DECAY, OSC A SAW",
  "FILTER SUSTAIN, SYNC",
  "FILTER RELEASE, OSC B SAW",
  "AMPLIFIER ATTACK, OSC B TRIANGLE",
  "AMPLIFIER DECAY, OSC B PULSE",
  "AMPLIFIER SUSTAIN, OSC B KEYBOARD",
  "AMPLIFIER RELEASE, UNISON",
  "CUTOFF, POLY-MOD FREQ A",
  "FILTER ENVELOPE AMOUNT, POLY-MOD PW A",
  "MIXER OSC B, POLY-MOD FILTER",
  "OSC B PULSE WIDTH, LFO SAW",
  "MIXER OSC A, LFO TRIANGLE",
  "OSC A PULSE WIDTH, LFO SQUARE",
  "MIXER NOISE, FILTER KEYBOARD",
  "RESONANCE, RELEASE",
  "GLIDE, WHEEL-MOD FREQ A",
  "LFO FREQUENCY, WHEEL-MOD FREQ B",
  "WHEEL-MOD SOURCE MIX, WHEEL-MOD PW A",
  "POLY-MOD OSC B, WHEEL-MOD PW B",
  "POLY-MOD FILTER ENVELOPE, WHEEL-MOD FILTER",
  "OSC A FREQUENCY, OSC B LO FREQ",
  "OSC B FREQUENCY",
  "OSC B FINE",
] as const;
/** The first byte whose top bit holds no switch: the last two hold a knob alone (the manual's table marks their switch "X"), and the server refuses that bit. */
export const PROPHET5_SWITCH_BYTES = 22;

const PROPHET5: readonly Field[] = PROPHET5_NAMES.map((name, at): Field => [at, name, at < PROPHET5_SWITCH_BYTES ? any : seven]);

/** A Jupiter-8 switch of two positions, a selector of four, the pulse width's three sources, and VCO-2's 36 semitones (owner's manual, printed pages 12 and 15 to 17). */
const JUPITER8_SWITCH = 1;
const JUPITER8_SELECTOR = 3;
const JUPITER8_PWM_SOURCE = 2;
export const JUPITER8_VCO2_RANGE = 36;

/** The Jupiter-8's 43 controls in the order of Roland's Jupiter-8/System-8 Parameter Correspondence Table, each with its largest value. */
const JUPITER8_CONTROLS: readonly (readonly [string, number])[] = [
  ["LFO RATE", ANY],
  ["LFO DELAY TIME", ANY],
  ["LFO WAVEFORM", JUPITER8_SELECTOR],
  ["VCO MODULATOR LFO MOD", ANY],
  ["VCO MODULATOR ENV MOD", ANY],
  ["VCO MODULATOR to VCO-1", JUPITER8_SWITCH],
  ["VCO MODULATOR to VCO-2", JUPITER8_SWITCH],
  ["PULSE WIDTH MODULATION", ANY],
  ["PWM source", JUPITER8_PWM_SOURCE],
  ["VCO-1 CROSS MOD", ANY],
  ["VCO-1 RANGE", JUPITER8_SELECTOR],
  ["VCO-1 WAVEFORM", JUPITER8_SELECTOR],
  ["VCO-2 SYNC", JUPITER8_SWITCH],
  ["VCO-2 LOW FREQ", JUPITER8_SWITCH],
  ["VCO-2 RANGE", JUPITER8_VCO2_RANGE],
  ["VCO-2 FINE TUNE", ANY],
  ["VCO-2 WAVEFORM", JUPITER8_SELECTOR],
  ["SOURCE MIX, VCO-1", ANY],
  ["SOURCE MIX, VCO-2", ANY],
  ["HPF CUTOFF FREQ", ANY],
  ["VCF CUTOFF FREQ", ANY],
  ["VCF RESONANCE", ANY],
  ["VCF SLOPE", JUPITER8_SWITCH],
  ["VCF ENV MOD", ANY],
  ["VCF envelope", JUPITER8_SWITCH],
  ["VCF LFO MOD", ANY],
  ["VCF KEY FOLLOW", ANY],
  ["VCA LEVEL", ANY],
  ["VCA LFO MOD", ANY],
  ["ENV-1 ATTACK", ANY],
  ["ENV-1 DECAY", ANY],
  ["ENV-1 SUSTAIN", ANY],
  ["ENV-1 RELEASE", ANY],
  ["ENV-1 polarity", JUPITER8_SWITCH],
  ["ENV-2 ATTACK", ANY],
  ["ENV-2 DECAY", ANY],
  ["ENV-2 SUSTAIN", ANY],
  ["ENV-2 RELEASE", ANY],
  ["ASSIGN MODE", JUPITER8_SELECTOR],
  ["ENV-1 KEY FOLLOW", JUPITER8_SWITCH],
  ["ENV-2 KEY FOLLOW", JUPITER8_SWITCH],
  ["BENDER to VCO-1", JUPITER8_SWITCH],
  ["BENDER to VCO-2", JUPITER8_SWITCH],
];

const JUPITER8: readonly Field[] = JUPITER8_CONTROLS.map(([name, most], at): Field => [at, name, { byte: most }]);

/** A CS-80 switch, and a selector of six positions (FEET and SUB OSCILLATOR FUNCTION). */
const CS80_SWITCH = 1;
const CS80_SELECTOR = 5;

/** A CS-80 tone, one row of the panel, as its memory panel orders it (owner's manual, page 36). */
const CS80_TONE: readonly (readonly [string, number])[] = [
  ["PWM SPEED", SEVEN_BITS],
  ["PWM", SEVEN_BITS],
  ["PW", SEVEN_BITS],
  ["SQUARE", CS80_SWITCH],
  ["SAWTOOTH", CS80_SWITCH],
  ["NOISE", SEVEN_BITS],
  ["HPF", SEVEN_BITS],
  ["RESh", SEVEN_BITS],
  ["LPF", SEVEN_BITS],
  ["RESl", SEVEN_BITS],
  ["IL", SEVEN_BITS],
  ["AL", SEVEN_BITS],
  ["filter A", SEVEN_BITS],
  ["filter D", SEVEN_BITS],
  ["filter R", SEVEN_BITS],
  ["VCF LEVEL", SEVEN_BITS],
  ["SINE", SEVEN_BITS],
  ["A", SEVEN_BITS],
  ["D", SEVEN_BITS],
  ["S", SEVEN_BITS],
  ["R", SEVEN_BITS],
  ["LEVEL", SEVEN_BITS],
  ["INITIAL BRILLIANCE", SEVEN_BITS],
  ["INITIAL LEVEL", SEVEN_BITS],
  ["AFTER BRILLIANCE", SEVEN_BITS],
  ["AFTER LEVEL", SEVEN_BITS],
];

/** The CS-80's controls outside its tones (the engine's cs80/patch.rs, after the owner's manual's items 1 to 46). */
const CS80_GLOBAL: readonly (readonly [string, number])[] = [
  ["FEET of channel I", CS80_SELECTOR],
  ["FEET of channel II", CS80_SELECTOR],
  ["DETUNE CH II", SEVEN_BITS],
  ["MIX", SEVEN_BITS],
  ["BRILLIANCE", SEVEN_BITS],
  ["RESONANCE", SEVEN_BITS],
  ["KEYBOARD CONTROL BRILLIANCE LOW", SEVEN_BITS],
  ["KEYBOARD CONTROL BRILLIANCE HIGH", SEVEN_BITS],
  ["KEYBOARD CONTROL LEVEL LOW", SEVEN_BITS],
  ["KEYBOARD CONTROL LEVEL HIGH", SEVEN_BITS],
  ["SUB OSCILLATOR FUNCTION", CS80_SELECTOR],
  ["SUB OSCILLATOR SPEED", SEVEN_BITS],
  ["SUB OSCILLATOR VCO", SEVEN_BITS],
  ["SUB OSCILLATOR VCF", SEVEN_BITS],
  ["SUB OSCILLATOR VCA", SEVEN_BITS],
  ["TOUCH RESPONSE PITCHBEND", SEVEN_BITS],
  ["TOUCH RESPONSE SPEED", SEVEN_BITS],
  ["TOUCH RESPONSE VCO", SEVEN_BITS],
  ["TOUCH RESPONSE VCF", SEVEN_BITS],
  ["RING MODULATOR ATTACK TIME", SEVEN_BITS],
  ["RING MODULATOR DECAY TIME", SEVEN_BITS],
  ["RING MODULATOR DEPTH", SEVEN_BITS],
  ["RING MODULATOR SPEED", SEVEN_BITS],
  ["RING MODULATOR MODULATION", SEVEN_BITS],
  ["SUSTAIN I or II", CS80_SWITCH],
  ["SUSTAIN", SEVEN_BITS],
  ["PORTAMENTO or GLISSANDO", CS80_SWITCH],
  ["PORTAMENTO/GLISSANDO", SEVEN_BITS],
  ["TREMOLO/CHORUS ON", CS80_SWITCH],
  ["CHORUS", CS80_SWITCH],
  ["TREMOLO", CS80_SWITCH],
  ["TREMOLO/CHORUS SPEED", SEVEN_BITS],
  ["TREMOLO/CHORUS DEPTH", SEVEN_BITS],
];

/** The bytes of a CS-80 tone. */
export const CS80_TONE_BYTES = CS80_TONE.length;

const CS80: readonly Field[] = [
  ...CS80_TONE.map(([name, most], at): Field => [at, `channel I ${name}`, { byte: most }]),
  ...CS80_TONE.map(([name, most], at): Field => [CS80_TONE_BYTES + at, `channel II ${name}`, { byte: most }]),
  ...CS80_GLOBAL.map(([name, most], at): Field => [2 * CS80_TONE_BYTES + at, name, { byte: most }]),
];

export const TABLES: Readonly<Record<Synth, readonly Field[]>> = { juno: JUNO, minimoog: MINIMOOG, prophet5: PROPHET5, jupiter8: JUPITER8, cs80: CS80 };
