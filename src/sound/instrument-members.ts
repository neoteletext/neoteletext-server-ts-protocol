// What a `sound` message carries for an instrument (REQ-6414, DEC-6410,
// DEC-6429, DEC-6461): a synth6581's or synth8580's sound as images of its
// registers, a sound of one of the nine synthesizers played by slots as
// blocks of timed MIDI messages, and the bank of patches such a sound
// plays with. Each name is its own kind of member: the name says which
// variant plays, and no field does.
// Each is stored whole and played by later commands, or live, announced
// once and added to as the program's time passes.

import type { ImagesPerBlock, RegisterSynth, Synth } from "./instrument-profile.ts";

/** The clock a synth6581 runs from, which sets the pitch a frequency register's value sounds at. */
export type Synth6581Clock = "pal" | "ntsc";

/** What every sound of a synth6581 or a synth8580 says of itself. */
export interface Synth6581Live {
  readonly handle: number;
  readonly generation: number;
  /** The images in each 20 ms block: 1 when absent, or 2 or 4 for register changes every 10 or 5 ms. */
  readonly imagesPerBlock?: ImagesPerBlock;
  /** PAL's when absent. */
  readonly clock?: Synth6581Clock;
}

/** A stored sound of a synth6581 or a synth8580: whole blocks of `imagesPerBlock` images of 25 bytes, 1 to 6,000 of them, sent once and played by later commands. */
export interface Synth6581Sound extends Synth6581Live {
  readonly images: Uint8Array;
}

/** A live sound's next blocks, of a synth6581 or a synth8580, 1 to 100 of them, from block number `first`. */
export interface Synth6581Blocks {
  readonly handle: number;
  readonly generation: number;
  readonly imagesPerBlock?: ImagesPerBlock;
  readonly first: number;
  readonly images: Uint8Array;
}

/** What every sound of a synthesizer played by slots says of itself. */
export interface SynthLive {
  readonly handle: number;
  readonly generation: number;
  /** The slots of each 20 ms block, 1 to 16. */
  readonly slots: number;
  /** The handle of the bank its program changes choose patches from: a bank of the synthesizer's own name, or of another of its family (synth106 and synth60; synth53, synth52 and synth51). */
  readonly bank: number;
}

/** A stored sound of a synthesizer played by slots: whole blocks of `slots` slots of 4 bytes, 1 to 6,000 of them. */
export interface SynthSound extends SynthLive {
  readonly blocks: Uint8Array;
}

/** A live sound's next blocks, of any synthesizer played by slots, 1 to 100 of them, from block number `first`. */
export interface SynthBlocks {
  readonly handle: number;
  readonly generation: number;
  readonly slots: number;
  readonly first: number;
  readonly blocks: Uint8Array;
}

/** A bank of one synthesizer's patches: 1 to 32, each the instrument's own layout and length (`packSynth106Patch` and its fellows write one), every byte within its control's range. */
export interface SynthBank {
  readonly handle: number;
  readonly generation: number;
  readonly patches: Uint8Array;
}

/** How a synth8's keyboard plays its upper and lower patches: every key the upper, every key both, or the keys below the split key the lower and the rest the upper. */
export type Synth8KeyMode = "whole" | "dual" | "split";

/** What a synth8 sound says of itself. Part 0's program changes choose its upper patch and part 1's its lower. */
export interface Synth8Live extends SynthLive {
  /** The whole keyboard when absent. */
  readonly keyMode?: Synth8KeyMode;
  /** The lowest key of the upper patch when split, a MIDI key of 0 to 127; middle C, 60, when absent. */
  readonly splitKey?: number;
}

/** A stored synth8 sound. */
export interface Synth8Sound extends Synth8Live {
  readonly blocks: Uint8Array;
}

/** The three members of one synthesizer played by images of registers: a stored sound, a live one and its blocks. */
type RegisterMembers<S extends RegisterSynth> = S extends RegisterSynth
  ? { readonly [K in S]: Synth6581Sound } | { readonly [K in `${S}Live`]: Synth6581Live } | { readonly [K in `${S}Blocks`]: Synth6581Blocks }
  : never;

/** The four members of one synthesizer played by slots: a stored sound, a live one, its blocks, and a bank. */
type SlotMembers<S extends Synth, Sound, Live> = S extends Synth
  ? | { readonly [K in S]: Sound }
    | { readonly [K in `${S}Live`]: Live }
    | { readonly [K in `${S}Blocks`]: SynthBlocks }
    | { readonly [K in `${S}Bank`]: SynthBank }
  : never;

/** One `sound` message's member for a synth6581 or a synth8580: `synth6581`, `synth6581Live` and `synth6581Blocks`, and the same of `synth8580`. */
export type RegisterMember = RegisterMembers<RegisterSynth>;

/** One `sound` message's member for a synthesizer played by slots, four for each name: `synth106`, `synth106Live`, `synth106Blocks` and `synth106Bank`, and so on. */
export type SynthMember = SlotMembers<Exclude<Synth, "synth8">, SynthSound, SynthLive> | SlotMembers<"synth8", Synth8Sound, Synth8Live>;

/** One `sound` message's member for an instrument. */
export type InstrumentMember = SynthMember | RegisterMember;
