// The instrument sounds as they travel (the server's REQ-6413, DEC-6410,
// DEC-6429, DEC-6461): images of registers for a synth6581 or a synth8580,
// the timed MIDI messages of a synthesizer played by slots, and a bank of
// its patches, each stored or live, hand-written to match the server's
// published schema as protocol.ts is. Each name is its own kind.

import type { RegisterSynth, Synth } from "../sound/instrument-profile.ts";

/** The clock a synth6581 runs from. */
type WireClock = "pal" | "ntsc";
/** The images of a synth6581's registers in one 20 ms block. */
type WireImagesPerBlock = 1 | 2 | 4;

/** The three kinds of a synthesizer played by images of registers, as they travel. */
type WireRegisterKinds<S extends RegisterSynth> = S extends RegisterSynth
  ? | {
        readonly kind: S;
        readonly handle: number;
        readonly generation: number;
        readonly images_per_block: WireImagesPerBlock;
        readonly clock: WireClock;
        readonly images: string;
      }
    | {
        readonly kind: `${S}_live`;
        readonly handle: number;
        readonly generation: number;
        readonly images_per_block: WireImagesPerBlock;
        readonly clock: WireClock;
      }
    | {
        readonly kind: `${S}_blocks`;
        readonly handle: number;
        readonly generation: number;
        readonly images_per_block: WireImagesPerBlock;
        readonly first: number;
        readonly images: string;
      }
  : never;

/** A sound of a synth6581 or a synth8580, by its `kind`. */
export type WireRegisterSound = WireRegisterKinds<RegisterSynth>;

/** A synth8's sound's fields beyond every other's. */
type WireSynth8Keys = { readonly key_mode: "whole" | "dual" | "split"; readonly split_key: number };

/** The four kinds of a synthesizer played by slots, as they travel. */
type WireSynthKinds<S extends Synth, Extra> = S extends Synth
  ? | ({
        readonly kind: S;
        readonly handle: number;
        readonly generation: number;
        readonly slots: number;
        readonly bank: number;
        readonly blocks: string;
      } & Extra)
    | ({ readonly kind: `${S}_live`; readonly handle: number; readonly generation: number; readonly slots: number; readonly bank: number } & Extra)
    | {
        readonly kind: `${S}_blocks`;
        readonly handle: number;
        readonly generation: number;
        readonly slots: number;
        readonly first: number;
        readonly blocks: string;
      }
    | { readonly kind: `${S}_bank`; readonly handle: number; readonly generation: number; readonly patches: string }
  : never;

/** A sound of a synthesizer played by slots, by its `kind`. */
export type WireSynthSound = WireSynthKinds<Exclude<Synth, "synth8">, unknown> | WireSynthKinds<"synth8", WireSynth8Keys>;

/** A `sound` message's own fields for an instrument's sound, by its `kind`. */
export type WireInstrumentSound = WireSynthSound | WireRegisterSound;
