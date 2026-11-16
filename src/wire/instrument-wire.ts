// The instrument sounds as they travel (the server's REQ-6413, DEC-6410):
// a SID sound's images of the chip's registers, a DX7 sound's timed MIDI
// messages and a bank of DX7 patches, each stored or live, hand-written to
// match the server's published schema as protocol.ts is.

/** The SID chip that plays a sound. */
type WireSidChip = "6581" | "8580";
/** The clock a SID chip runs from. */
type WireSidClock = "pal" | "ntsc";
/** The images of the SID chip's registers in one 20 ms block. */
type WireImagesPerBlock = 1 | 2 | 4;

/** A `sound` message's own fields for an instrument's sound, by its `kind`. */
export type WireInstrumentSound =
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
