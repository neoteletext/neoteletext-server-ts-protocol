// What a `sound` message carries for an instrument (REQ-6414, DEC-6410):
// a SID sound as images of the chip's registers, a DX7 sound as blocks of
// timed MIDI messages, and the bank of patches a DX7 sound plays with.
// Each is stored whole and played by later commands, or live, announced
// once and added to as the program's time passes.

import type { ImagesPerBlock } from "./instrument-profile.ts";

/** The SID chip that plays a sound: the two differ in their filter and their combined waveforms. */
export type SidChip = "6581" | "8580";

/** The clock the SID chip runs from, which sets the pitch a frequency register's value sounds at. */
export type SidClock = "pal" | "ntsc";

/** What every SID sound says of itself. */
export interface SidLive {
  readonly handle: number;
  readonly generation: number;
  /** The images in each 20 ms block: 1 when absent, or 2 or 4 for register changes every 10 or 5 ms. */
  readonly imagesPerBlock?: ImagesPerBlock;
  /** The 6581 when absent. */
  readonly chip?: SidChip;
  /** PAL's when absent. */
  readonly clock?: SidClock;
}

/** A stored SID sound: whole blocks of `imagesPerBlock` images of 25 bytes, 1 to 6,000 of them, sent once and played by later commands. */
export interface SidSound extends SidLive {
  readonly images: Uint8Array;
}

/** A live SID sound's next blocks, 1 to 100 of them, from block number `first`. */
export interface SidBlocks {
  readonly handle: number;
  readonly generation: number;
  readonly imagesPerBlock?: ImagesPerBlock;
  readonly first: number;
  readonly images: Uint8Array;
}

/** What every DX7 sound says of itself. */
export interface Dx7Live {
  readonly handle: number;
  readonly generation: number;
  /** The slots of each 20 ms block, 1 to 16. */
  readonly slots: number;
  /** The handle of the bank its program changes choose patches from. */
  readonly bank: number;
}

/** A stored DX7 sound: whole blocks of `slots` slots of 4 bytes, 1 to 6,000 of them. */
export interface Dx7Sound extends Dx7Live {
  readonly blocks: Uint8Array;
}

/** A live DX7 sound's next blocks, 1 to 100 of them, from block number `first`. */
export interface Dx7Blocks {
  readonly handle: number;
  readonly generation: number;
  readonly slots: number;
  readonly first: number;
  readonly blocks: Uint8Array;
}

/** A bank of DX7 patches: 1 to 32 of 128 packed bytes each, every byte at most 127. */
export interface Dx7Bank {
  readonly handle: number;
  readonly generation: number;
  readonly patches: Uint8Array;
}

/** One `sound` message's member for an instrument. */
export type InstrumentMember =
  | { readonly sid: SidSound }
  | { readonly sidLive: SidLive }
  | { readonly sidBlocks: SidBlocks }
  | { readonly dx7: Dx7Sound }
  | { readonly dx7Live: Dx7Live }
  | { readonly dx7Blocks: Dx7Blocks }
  | { readonly dx7Bank: Dx7Bank };
