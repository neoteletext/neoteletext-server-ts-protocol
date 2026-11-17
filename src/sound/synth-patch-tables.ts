// The analogue synthesizers' patches as tables of fields (DEC-6429): each
// byte's control, as the instrument's panel names it, and its range. A
// port of the server's protocol/check/instrument/patch.rs at
// neoteletext-app-server e2f5e1b, which follows the engine's
// `<instrument>/patch.rs`; the rules that read them are
// synth-patch-rules.ts, and the packers name their bytes from them.

import { SEVEN_BITS, type SynthFamily } from "./instrument-profile.ts";

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
  /** The synth106's first switch byte: seven bits, its three range bits exactly one of 16', 8' and 4'. */
  | { readonly synth106Feet: true };

/** A field: its first byte, its control's name and its range. */
export type Field = readonly [at: number, name: string, range: Range];

/** Every value of a byte: the synth53 keeps a knob in its low seven bits and a switch in its top bit, and a synth8 slider is a whole byte. */
const ANY = 0xff;
const seven: Range = { byte: SEVEN_BITS };
const any: Range = { byte: ANY };

/** The synth106's first switch byte's range bits, one each for 16', 8' and 4' (JUNO-106 owner's manual, MIDI Implementation 3.4). */
export const SYNTH106_FEET_BITS = { 16: 0b001, 8: 0b010, 4: 0b100 } as const;
export const SYNTH106_FEET_MASK = 0b111;
/** The synth106's second switch byte: PWM, ENV polarity, VCA mode and two bits of the high-pass filter. */
const SYNTH106_SWITCH_BITS = 0b1_1111;

/** The synth106's sliders, by parameter number (JUNO-106 owner's manual, MIDI Implementation 3.4). */
const SYNTH106_SLIDERS = [
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

const SYNTH106_FIELDS: readonly Field[] = [
  ...SYNTH106_SLIDERS.map((name, at): Field => [at, name, seven]),
  [16, "range, waveforms and chorus", { synth106Feet: true }],
  [17, "PWM, ENV, VCA and HPF switches", { bits: SYNTH106_SWITCH_BITS }],
];

/** A synthD knob's largest value: tenths of its dial's 0 to 10. */
export const SYNTHD_KNOB = 100;
/** A range or waveform switch's last position: six of each (owner's manual, page 4). */
const SYNTHD_POSITION = 5;
/** TUNE's travel either way, in cents (the engine's synthd::law). */
export const SYNTHD_TUNE_CENTS = 242;
/** An oscillator's FREQUENCY travel either way, in cents: seven semitones. */
export const SYNTHD_FREQUENCY_CENTS = 700;
/** CUTOFF FREQUENCY's ends: hundredths of the dial's -5 to 5. */
export const SYNTHD_CUTOFF = 500;
/** A contour's longest time, in milliseconds: the dial's 10 seconds. */
export const SYNTHD_TIME_MS = 10_000;
/** The first switch byte's bits: oscillator modulation, oscillator 3 control and the mixer's five switches. */
const SYNTHD_FIRST_SWITCHES = (1 << 7) - 1;
/** The second's: pink noise, filter modulation, the two keyboard controls, glide and decay. */
const SYNTHD_SECOND_SWITCHES = (1 << 6) - 1;

const knob: Range = { byte: SYNTHD_KNOB };
const position: Range = { byte: SYNTHD_POSITION };
const time: Range = { word: SYNTHD_TIME_MS };

const SYNTHD_FIELDS: readonly Field[] = [
  [0, "TUNE", { signed: SYNTHD_TUNE_CENTS }],
  [2, "GLIDE", knob],
  [3, "MODULATION MIX", knob],
  [4, "OSCILLATOR 1 RANGE", position],
  [5, "OSCILLATOR 1 WAVEFORM", position],
  [6, "OSCILLATOR 2 RANGE", position],
  [7, "OSCILLATOR 2 WAVEFORM", position],
  [8, "OSCILLATOR 2 FREQUENCY", { signed: SYNTHD_FREQUENCY_CENTS }],
  [10, "OSCILLATOR 3 RANGE", position],
  [11, "OSCILLATOR 3 WAVEFORM", position],
  [12, "OSCILLATOR 3 FREQUENCY", { signed: SYNTHD_FREQUENCY_CENTS }],
  [14, "OSCILLATOR 1 VOLUME", knob],
  [15, "OSCILLATOR 2 VOLUME", knob],
  [16, "OSCILLATOR 3 VOLUME", knob],
  [17, "EXTERNAL INPUT VOLUME", knob],
  [18, "NOISE VOLUME", knob],
  [19, "CUTOFF FREQUENCY", { signed: SYNTHD_CUTOFF }],
  [21, "EMPHASIS", knob],
  [22, "AMOUNT OF CONTOUR", knob],
  [23, "filter ATTACK TIME", time],
  [25, "filter DECAY TIME", time],
  [27, "filter SUSTAIN LEVEL", knob],
  [28, "loudness ATTACK TIME", time],
  [30, "loudness DECAY TIME", time],
  [32, "loudness SUSTAIN LEVEL", knob],
  [33, "main output VOLUME", knob],
  [34, "modulation and mixer switches", { bits: SYNTHD_FIRST_SWITCHES }],
  [35, "noise, filter, keyboard, glide and decay switches", { bits: SYNTHD_SECOND_SWITCHES }],
];

/** The synth53's 24 bytes, each a knob in its low seven bits and a switch in its top bit, as the server names them (Prophet-5 Operation Manual CM1000D, section 6-7). */
const SYNTH53_NAMES = [
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
export const SYNTH53_SWITCH_BYTES = 22;

const SYNTH53_FIELDS: readonly Field[] = SYNTH53_NAMES.map((name, at): Field => [at, name, at < SYNTH53_SWITCH_BYTES ? any : seven]);

/** A synth8 switch of two positions, a selector of four, the pulse width's three sources, and VCO-2's 36 semitones (Jupiter-8 owner's manual, printed pages 12 and 15 to 17). */
const SYNTH8_SWITCH = 1;
const SYNTH8_SELECTOR = 3;
const SYNTH8_PWM_SOURCE = 2;
export const SYNTH8_VCO2_RANGE = 36;

/** The synth8's 43 controls in the order of Roland's Jupiter-8/System-8 Parameter Correspondence Table, each with its largest value. */
const SYNTH8_CONTROLS: readonly (readonly [string, number])[] = [
  ["LFO RATE", ANY],
  ["LFO DELAY TIME", ANY],
  ["LFO WAVEFORM", SYNTH8_SELECTOR],
  ["VCO MODULATOR LFO MOD", ANY],
  ["VCO MODULATOR ENV MOD", ANY],
  ["VCO MODULATOR to VCO-1", SYNTH8_SWITCH],
  ["VCO MODULATOR to VCO-2", SYNTH8_SWITCH],
  ["PULSE WIDTH MODULATION", ANY],
  ["PWM source", SYNTH8_PWM_SOURCE],
  ["VCO-1 CROSS MOD", ANY],
  ["VCO-1 RANGE", SYNTH8_SELECTOR],
  ["VCO-1 WAVEFORM", SYNTH8_SELECTOR],
  ["VCO-2 SYNC", SYNTH8_SWITCH],
  ["VCO-2 LOW FREQ", SYNTH8_SWITCH],
  ["VCO-2 RANGE", SYNTH8_VCO2_RANGE],
  ["VCO-2 FINE TUNE", ANY],
  ["VCO-2 WAVEFORM", SYNTH8_SELECTOR],
  ["SOURCE MIX, VCO-1", ANY],
  ["SOURCE MIX, VCO-2", ANY],
  ["HPF CUTOFF FREQ", ANY],
  ["VCF CUTOFF FREQ", ANY],
  ["VCF RESONANCE", ANY],
  ["VCF SLOPE", SYNTH8_SWITCH],
  ["VCF ENV MOD", ANY],
  ["VCF envelope", SYNTH8_SWITCH],
  ["VCF LFO MOD", ANY],
  ["VCF KEY FOLLOW", ANY],
  ["VCA LEVEL", ANY],
  ["VCA LFO MOD", ANY],
  ["ENV-1 ATTACK", ANY],
  ["ENV-1 DECAY", ANY],
  ["ENV-1 SUSTAIN", ANY],
  ["ENV-1 RELEASE", ANY],
  ["ENV-1 polarity", SYNTH8_SWITCH],
  ["ENV-2 ATTACK", ANY],
  ["ENV-2 DECAY", ANY],
  ["ENV-2 SUSTAIN", ANY],
  ["ENV-2 RELEASE", ANY],
  ["ASSIGN MODE", SYNTH8_SELECTOR],
  ["ENV-1 KEY FOLLOW", SYNTH8_SWITCH],
  ["ENV-2 KEY FOLLOW", SYNTH8_SWITCH],
  ["BENDER to VCO-1", SYNTH8_SWITCH],
  ["BENDER to VCO-2", SYNTH8_SWITCH],
];

const SYNTH8_FIELDS: readonly Field[] = SYNTH8_CONTROLS.map(([name, most], at): Field => [at, name, { byte: most }]);

/** A synth80 switch, and a selector of six positions (FEET and SUB OSCILLATOR FUNCTION). */
const SYNTH80_SWITCH = 1;
const SYNTH80_SELECTOR = 5;

/** A synth80 tone, one row of the panel, as its memory panel orders it (CS-80 owner's manual, page 36). */
const SYNTH80_TONE: readonly (readonly [string, number])[] = [
  ["PWM SPEED", SEVEN_BITS],
  ["PWM", SEVEN_BITS],
  ["PW", SEVEN_BITS],
  ["SQUARE", SYNTH80_SWITCH],
  ["SAWTOOTH", SYNTH80_SWITCH],
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

/** The synth80's controls outside its tones (the engine's synth80/patch.rs, after the CS-80 owner's manual's items 1 to 46). */
const SYNTH80_GLOBAL: readonly (readonly [string, number])[] = [
  ["FEET of channel I", SYNTH80_SELECTOR],
  ["FEET of channel II", SYNTH80_SELECTOR],
  ["DETUNE CH II", SEVEN_BITS],
  ["MIX", SEVEN_BITS],
  ["BRILLIANCE", SEVEN_BITS],
  ["RESONANCE", SEVEN_BITS],
  ["KEYBOARD CONTROL BRILLIANCE LOW", SEVEN_BITS],
  ["KEYBOARD CONTROL BRILLIANCE HIGH", SEVEN_BITS],
  ["KEYBOARD CONTROL LEVEL LOW", SEVEN_BITS],
  ["KEYBOARD CONTROL LEVEL HIGH", SEVEN_BITS],
  ["SUB OSCILLATOR FUNCTION", SYNTH80_SELECTOR],
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
  ["SUSTAIN I or II", SYNTH80_SWITCH],
  ["SUSTAIN", SEVEN_BITS],
  ["PORTAMENTO or GLISSANDO", SYNTH80_SWITCH],
  ["PORTAMENTO/GLISSANDO", SEVEN_BITS],
  ["TREMOLO/CHORUS ON", SYNTH80_SWITCH],
  ["CHORUS", SYNTH80_SWITCH],
  ["TREMOLO", SYNTH80_SWITCH],
  ["TREMOLO/CHORUS SPEED", SEVEN_BITS],
  ["TREMOLO/CHORUS DEPTH", SEVEN_BITS],
];

/** The bytes of a synth80 tone. */
export const SYNTH80_TONE_BYTES = SYNTH80_TONE.length;

const SYNTH80_FIELDS: readonly Field[] = [
  ...SYNTH80_TONE.map(([name, most], at): Field => [at, `channel I ${name}`, { byte: most }]),
  ...SYNTH80_TONE.map(([name, most], at): Field => [SYNTH80_TONE_BYTES + at, `channel II ${name}`, { byte: most }]),
  ...SYNTH80_GLOBAL.map(([name, most], at): Field => [2 * SYNTH80_TONE_BYTES + at, name, { byte: most }]),
];

export const TABLES: Readonly<Record<Exclude<SynthFamily, "synth7">, readonly Field[]>> = {
  synth106: SYNTH106_FIELDS,
  synthd: SYNTHD_FIELDS,
  synth53: SYNTH53_FIELDS,
  synth8: SYNTH8_FIELDS,
  synth80: SYNTH80_FIELDS,
};
