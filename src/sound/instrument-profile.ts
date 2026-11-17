// The audio profile's instrument codecs (the engine's REQ-6411, DEC-6410;
// the server's REQ-6413; DEC-6429; DEC-6461): the synthesizers played by
// images of registers, synth6581 and synth8580, and the nine played by
// slots of timed MIDI messages, each with a bank of its patches, with the
// bounds the server holds each to. Which instrument each models is in
// neoteletext-common's docs/audio/synthesizers.md.

import { MOST_SAMPLES, SECOND_MS } from "./profile.ts";

/** The one rate the instruments' sounds are made at. */
export const INSTRUMENT_RATE = 48_000;

/** An instrument's block plays for this long. */
export const INSTRUMENT_BLOCK_MS = 20;

/** Samples a block plays for, at {@link INSTRUMENT_RATE}: 960. */
const INSTRUMENT_BLOCK_SAMPLES = (INSTRUMENT_RATE * INSTRUMENT_BLOCK_MS) / SECOND_MS;

/** The most blocks of a stored instrument sound: two minutes, 6,000 blocks, the receivers' limit on a stored sound. */
export const MOST_INSTRUMENT_BLOCKS = MOST_SAMPLES / INSTRUMENT_BLOCK_SAMPLES;

/** The most blocks one message adds to a live instrument sound: two seconds (the server's MOST_LIVE_INSTRUMENT_BLOCKS). */
export const MOST_LIVE_INSTRUMENT_BLOCKS = 100;

/** A synth6581's writable registers, one image of them: 25 bytes, in address order. */
export const SYNTH6581_IMAGE_BYTES = 25;

/** How many images of a synth6581's registers a block may hold: one every 20, 10 or 5 ms. */
export const SYNTH6581_IMAGES_PER_BLOCK = [1, 2, 4] as const;

export type ImagesPerBlock = (typeof SYNTH6581_IMAGES_PER_BLOCK)[number];

/** One slot of a block: a time, a MIDI status byte and its two data bytes. */
export const SLOT_BYTES = 4;

/** The most slots a block holds. */
export const MOST_SLOTS = 16;

/** A slot's time is in tenths of a millisecond within its block. */
export const SLOT_TIMES_A_MS = 10;

/** The times of a block: 0 to 199. */
export const SLOT_BLOCK_TIMES = INSTRUMENT_BLOCK_MS * SLOT_TIMES_A_MS;

/** One synth7 patch in the instrument's packed form: 128 bytes (the bulk dump of 32 voices). */
export const SYNTH7_PATCH_BYTES = 128;

/** The most patches a bank holds: the synth7's 32 voices, and as many in a synthesizer's bank, so that a program change means the same in each (the engine's PATCH_BANK_PATCHES). */
export const MOST_PATCHES = 32;

/** The synthesizers played by images of registers: two names of one instrument, which differ in their filter and their combined waveforms. */
export type RegisterSynth = "synth6581" | "synth8580";

/** Every synthesizer played by images of registers. */
export const REGISTER_SYNTHS: readonly RegisterSynth[] = ["synth6581", "synth8580"];

/** The synthesizers played by slots of timed MIDI messages (DEC-6461), each name its own kind of sound: synth7, and the analogue synthesizers of DEC-6429. */
export type Synth = "synth7" | "synth106" | "synth60" | "synthd" | "synth53" | "synth52" | "synth51" | "synth8" | "synth80";

/** Every synthesizer played by slots, in the order of their codecs, a codec's variants together. */
export const SYNTHS: readonly Synth[] = ["synth7", "synth106", "synth60", "synthd", "synth53", "synth52", "synth51", "synth8", "synth80"];

/** The synthesizers whose code, codec and patch layout others share, each named for its first variant. */
export type SynthFamily = "synth7" | "synth106" | "synthd" | "synth53" | "synth8" | "synth80";

/** The family each synthesizer is of: synth60 plays synth106's patches and messages, and synth52 and synth51 play synth53's. */
export const SYNTH_FAMILY = {
  synth7: "synth7",
  synth106: "synth106",
  synth60: "synth106",
  synthd: "synthd",
  synth53: "synth53",
  synth52: "synth53",
  synth51: "synth53",
  synth8: "synth8",
  synth80: "synth80",
} as const satisfies Record<Synth, SynthFamily>;

/** The bytes of one patch of each synthesizer, in the instrument's own layout (the engine's `<instrument>/patch.rs`; the server's *_PATCH_BYTES). */
export const SYNTH_PATCH_BYTES = {
  synth7: SYNTH7_PATCH_BYTES,
  synth106: 18,
  synth60: 18,
  synthd: 36,
  synth53: 24,
  synth52: 24,
  synth51: 24,
  synth8: 43,
  synth80: 85,
} as const satisfies Record<Synth, number>;

/** The most a byte of a patch, or a MIDI data byte, holds: 7 bits. */
export const SEVEN_BITS = 0x7f;

if (!Number.isInteger(MOST_INSTRUMENT_BLOCKS)) {
  throw new RangeError(`two minutes are whole blocks, not ${MOST_INSTRUMENT_BLOCKS}`);
}
