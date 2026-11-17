// What a `sound` message carries for an instrument (REQ-6414, DEC-6410,
// DEC-6429): a SID sound as images of the chip's registers, a sound of the
// DX7 or of an analogue synthesizer as blocks of timed MIDI messages, and
// the bank of patches such a sound plays with.
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

/** What every sound of an analogue synthesizer says of itself: as a DX7 sound, the bank named being one of the same synthesizer's patches. */
export interface SynthLive {
  readonly handle: number;
  readonly generation: number;
  /** The slots of each 20 ms block, 1 to 16. */
  readonly slots: number;
  /** The handle of the bank of the synthesizer's patches its program changes choose from. */
  readonly bank: number;
}

/** A stored sound of an analogue synthesizer: whole blocks of `slots` slots of 4 bytes, 1 to 6,000 of them. */
export interface SynthSound extends SynthLive {
  readonly blocks: Uint8Array;
}

/** A live sound's next blocks, of any analogue synthesizer, 1 to 100 of them, from block number `first`. */
export interface SynthBlocks {
  readonly handle: number;
  readonly generation: number;
  readonly slots: number;
  readonly first: number;
  readonly blocks: Uint8Array;
}

/** A bank of one analogue synthesizer's patches: 1 to 32, each the instrument's own layout and length (`packJunoPatch` and its fellows write one), every byte within its control's range. */
export interface SynthBank {
  readonly handle: number;
  readonly generation: number;
  readonly patches: Uint8Array;
}

/** The Juno that plays a sound: the Juno-106 or the Juno-60. */
export type JunoModel = "106" | "60";

/** What a Juno sound says of itself. */
export interface JunoLive extends SynthLive {
  /** The Juno-106 when absent. */
  readonly model?: JunoModel;
}

/** A stored Juno sound. */
export interface JunoSound extends JunoLive {
  readonly blocks: Uint8Array;
}

/** The Prophet-5 that plays a sound: revision 3, or revisions 1 and 2. */
export type Prophet5Model = "revision_3" | "revisions_1_and_2";

/** What a Prophet-5 sound says of itself. */
export interface Prophet5Live extends SynthLive {
  /** Revision 3 when absent. */
  readonly model?: Prophet5Model;
}

/** A stored Prophet-5 sound. */
export interface Prophet5Sound extends Prophet5Live {
  readonly blocks: Uint8Array;
}

/** How a Jupiter-8's keyboard plays its upper and lower patches: every key the upper, every key both, or the keys below the split key the lower and the rest the upper. */
export type Jupiter8KeyMode = "whole" | "dual" | "split";

/** What a Jupiter-8 sound says of itself. Part 0's program changes choose its upper patch and part 1's its lower. */
export interface Jupiter8Live extends SynthLive {
  /** The whole keyboard when absent. */
  readonly keyMode?: Jupiter8KeyMode;
  /** The lowest key of the upper patch when split, a MIDI key of 0 to 127; middle C, 60, when absent. */
  readonly splitKey?: number;
}

/** A stored Jupiter-8 sound. */
export interface Jupiter8Sound extends Jupiter8Live {
  readonly blocks: Uint8Array;
}

/** A Juno's members: a stored sound, a live one, its blocks, and a bank. */
export type JunoMember =
  { readonly juno: JunoSound } | { readonly junoLive: JunoLive } | { readonly junoBlocks: SynthBlocks } | { readonly junoBank: SynthBank };

/** A Minimoog's members. */
export type MinimoogMember =
  { readonly minimoog: SynthSound } | { readonly minimoogLive: SynthLive } | { readonly minimoogBlocks: SynthBlocks } | { readonly minimoogBank: SynthBank };

/** A Prophet-5's members. */
export type Prophet5Member =
  | { readonly prophet5: Prophet5Sound }
  | { readonly prophet5Live: Prophet5Live }
  | { readonly prophet5Blocks: SynthBlocks }
  | { readonly prophet5Bank: SynthBank };

/** A Jupiter-8's members. */
export type Jupiter8Member =
  | { readonly jupiter8: Jupiter8Sound }
  | { readonly jupiter8Live: Jupiter8Live }
  | { readonly jupiter8Blocks: SynthBlocks }
  | { readonly jupiter8Bank: SynthBank };

/** A CS-80's members. */
export type Cs80Member =
  { readonly cs80: SynthSound } | { readonly cs80Live: SynthLive } | { readonly cs80Blocks: SynthBlocks } | { readonly cs80Bank: SynthBank };

/** One `sound` message's member for an analogue synthesizer: four for each, a stored sound, a live one, its blocks, and a bank. */
export type SynthMember = JunoMember | MinimoogMember | Prophet5Member | Jupiter8Member | Cs80Member;

/** One `sound` message's member for an instrument. */
export type InstrumentMember =
  | SynthMember
  | { readonly sid: SidSound }
  | { readonly sidLive: SidLive }
  | { readonly sidBlocks: SidBlocks }
  | { readonly dx7: Dx7Sound }
  | { readonly dx7Live: Dx7Live }
  | { readonly dx7Blocks: Dx7Blocks }
  | { readonly dx7Bank: Dx7Bank };
