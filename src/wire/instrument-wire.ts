// The instrument sounds as they travel (the server's REQ-6413, DEC-6410,
// DEC-6429): a SID sound's images of the chip's registers, the timed MIDI
// messages of a DX7 sound or an analogue synthesizer's, and a bank of
// patches for either, each stored or live, hand-written to match the
// server's published schema as protocol.ts is.

/** The SID chip that plays a sound. */
type WireSidChip = "6581" | "8580";
/** The clock a SID chip runs from. */
type WireSidClock = "pal" | "ntsc";
/** The images of the SID chip's registers in one 20 ms block. */
type WireImagesPerBlock = 1 | 2 | 4;

/** A synthesizer's sound's fields beyond a DX7 sound's: none for the Minimoog and the CS-80. */
interface WireSynthExtra {
  readonly juno: { readonly model: "106" | "60" };
  readonly minimoog: unknown;
  readonly prophet5: { readonly model: "revision_3" | "revisions_1_and_2" };
  readonly jupiter8: { readonly key_mode: "whole" | "dual" | "split"; readonly split_key: number };
  readonly cs80: unknown;
}

/** A synthesizer's four kinds, as they travel. */
type WireSynthKinds<S extends keyof WireSynthExtra> =
  | ({
      readonly kind: S;
      readonly handle: number;
      readonly generation: number;
      readonly slots: number;
      readonly bank: number;
      readonly blocks: string;
    } & WireSynthExtra[S])
  | ({ readonly kind: `${S}_live`; readonly handle: number; readonly generation: number; readonly slots: number; readonly bank: number } & WireSynthExtra[S])
  | {
      readonly kind: `${S}_blocks`;
      readonly handle: number;
      readonly generation: number;
      readonly slots: number;
      readonly first: number;
      readonly blocks: string;
    }
  | { readonly kind: `${S}_bank`; readonly handle: number; readonly generation: number; readonly patches: string };

/** An analogue synthesizer's sound, by its `kind`. */
export type WireSynthSound =
  WireSynthKinds<"juno"> | WireSynthKinds<"minimoog"> | WireSynthKinds<"prophet5"> | WireSynthKinds<"jupiter8"> | WireSynthKinds<"cs80">;

/** A `sound` message's own fields for an instrument's sound, by its `kind`. */
export type WireInstrumentSound =
  | WireSynthSound
  | {
      readonly kind: "sid";
      readonly handle: number;
      readonly generation: number;
      readonly images_per_block: WireImagesPerBlock;
      readonly chip: WireSidChip;
      readonly clock: WireSidClock;
      readonly images: string;
    }
  | {
      readonly kind: "sid_live";
      readonly handle: number;
      readonly generation: number;
      readonly images_per_block: WireImagesPerBlock;
      readonly chip: WireSidChip;
      readonly clock: WireSidClock;
    }
  | {
      readonly kind: "sid_blocks";
      readonly handle: number;
      readonly generation: number;
      readonly images_per_block: WireImagesPerBlock;
      readonly first: number;
      readonly images: string;
    }
  | { readonly kind: "dx7"; readonly handle: number; readonly generation: number; readonly slots: number; readonly bank: number; readonly blocks: string }
  | { readonly kind: "dx7_live"; readonly handle: number; readonly generation: number; readonly slots: number; readonly bank: number }
  | {
      readonly kind: "dx7_blocks";
      readonly handle: number;
      readonly generation: number;
      readonly slots: number;
      readonly first: number;
      readonly blocks: string;
    }
  | { readonly kind: "dx7_bank"; readonly handle: number; readonly generation: number; readonly patches: string };
