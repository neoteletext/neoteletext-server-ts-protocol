// The audio profile's instrument codecs (the engine's REQ-6411, DEC-6410;
// the server's REQ-6413; DEC-6429): the SID chip, the Yamaha DX7 and a
// bank of DX7 patches, and the five analogue synthesizers and a bank of
// one's patches, with the bounds the server holds each to.

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

/** The SID chip's writable registers, one image of them: 25 bytes, in address order. */
export const SID_IMAGE_BYTES = 25;

/** How many images of the SID chip's registers a block may hold: one every 20, 10 or 5 ms. */
export const SID_IMAGES_PER_BLOCK = [1, 2, 4] as const;

export type ImagesPerBlock = (typeof SID_IMAGES_PER_BLOCK)[number];

/** One slot of a DX7 block: a time, a MIDI status byte and its two data bytes. */
export const DX7_SLOT_BYTES = 4;

/** The most slots a DX7 block holds. */
export const DX7_MOST_SLOTS = 16;

/** A DX7 slot's time is in tenths of a millisecond within its block. */
export const DX7_TIMES_A_MS = 10;

/** The times of a DX7 block: 0 to 199. */
export const DX7_BLOCK_TIMES = INSTRUMENT_BLOCK_MS * DX7_TIMES_A_MS;

/** One DX7 patch in the instrument's packed form: 128 bytes (the bulk dump of 32 voices). */
export const DX7_PATCH_BYTES = 128;

/** The most patches a bank holds: the DX7's 32 voices, and as many in a synthesizer's bank, so that a program change means the same in each (the engine's PATCH_BANK_PATCHES). */
export const DX7_MOST_PATCHES = 32;

/** The analogue synthesizers (DEC-6429): Roland's Juno-106 and Juno-60, Moog's Minimoog Model D, Sequential Circuits' Prophet-5, Roland's Jupiter-8 and Yamaha's CS-80. Each sound's block is the DX7's, slots of timed MIDI messages. */
export type Synth = "juno" | "minimoog" | "prophet5" | "jupiter8" | "cs80";

/** Every synthesizer, in the order of their codecs. */
export const SYNTHS: readonly Synth[] = ["juno", "minimoog", "prophet5", "jupiter8", "cs80"];

/** The bytes of one patch of each synthesizer, in the instrument's own layout (the engine's `<instrument>/patch.rs`; the server's *_PATCH_BYTES). */
export const SYNTH_PATCH_BYTES = {
  juno: 18,
  minimoog: 36,
  prophet5: 24,
  jupiter8: 43,
  cs80: 85,
} as const satisfies Record<Synth, number>;

/** The most a byte of a patch, or a MIDI data byte, holds: 7 bits. */
export const SEVEN_BITS = 0x7f;

if (!Number.isInteger(MOST_INSTRUMENT_BLOCKS)) {
  throw new RangeError(`two minutes are whole blocks, not ${MOST_INSTRUMENT_BLOCKS}`);
}
