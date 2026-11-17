// The instrument members as the protocol writes them (REQ-6414; the
// server's REQ-6413; DEC-6429; DEC-6461): bytes as base64, each member
// checked here as the server checks it, the same bounds and the same rules
// for a slot and for a patch, so a mistake is a RangeError where it is
// made rather than a refusal in the server's log.

import type { InstrumentMember, RegisterMember, Synth6581Blocks, Synth6581Clock, Synth6581Live, Synth6581Sound } from "./instrument-members.ts";
import {
  type ImagesPerBlock,
  MOST_INSTRUMENT_BLOCKS,
  MOST_LIVE_INSTRUMENT_BLOCKS,
  REGISTER_SYNTHS,
  type RegisterSynth,
  SYNTH6581_IMAGE_BYTES,
  SYNTH6581_IMAGES_PER_BLOCK,
} from "./instrument-profile.ts";
import { handleFields, listed, whole, wholeIn } from "./member-pieces.ts";
import { LAST_BLOCK } from "./profile.ts";
import { SYNTH_KEYS, isSynthMember, synthFields } from "./synth-fields.ts";
import type { WireInstrumentSound, WireRegisterSound } from "../wire/instrument-wire.ts";

const CLOCKS: readonly string[] = ["pal", "ntsc"] satisfies readonly Synth6581Clock[];

function imagesPerBlockOf(imagesPerBlock: ImagesPerBlock | undefined): ImagesPerBlock {
  const images = imagesPerBlock ?? 1;
  if (!SYNTH6581_IMAGES_PER_BLOCK.includes(images)) {
    throw new RangeError(`sound: images_per_block is 1, 2 or 4, not ${images}`);
  }
  return images;
}

function liveFields(live: Synth6581Live): Omit<Extract<WireRegisterSound, { kind: "synth6581_live" }>, "kind"> {
  return { ...handleFields(live), images_per_block: imagesPerBlockOf(live.imagesPerBlock), clock: listed("clock", live.clock ?? "pal", CLOCKS) };
}

function storedFields(sound: Synth6581Sound): Omit<Extract<WireRegisterSound, { kind: "synth6581" }>, "kind"> {
  const fields = liveFields(sound);
  return { ...fields, images: whole("images", sound.images, SYNTH6581_IMAGE_BYTES * fields.images_per_block, MOST_INSTRUMENT_BLOCKS, "blocks") };
}

function blocksFields(blocks: Synth6581Blocks): Omit<Extract<WireRegisterSound, { kind: "synth6581_blocks" }>, "kind"> {
  const imagesPerBlock = imagesPerBlockOf(blocks.imagesPerBlock);
  return {
    ...handleFields(blocks),
    images_per_block: imagesPerBlock,
    first: wholeIn("first", blocks.first, 0, LAST_BLOCK),
    images: whole("images", blocks.images, SYNTH6581_IMAGE_BYTES * imagesPerBlock, MOST_LIVE_INSTRUMENT_BLOCKS, "blocks"),
  };
}

/** Every member a synthesizer played by images of registers may be, each absent but the one a member is. */
type AnyRegisterMember = { readonly [K in RegisterSynth]?: Synth6581Sound } & { readonly [K in `${RegisterSynth}Live`]?: Synth6581Live } & {
  readonly [K in `${RegisterSynth}Blocks`]?: Synth6581Blocks;
};

function registerFields(member: RegisterMember): WireRegisterSound {
  const any: AnyRegisterMember = member;
  for (const synth of REGISTER_SYNTHS) {
    const sound = any[synth];
    if (sound !== undefined) {
      return { kind: synth, ...storedFields(sound) };
    }
    const live = any[`${synth}Live`];
    if (live !== undefined) {
      return { kind: `${synth}_live`, ...liveFields(live) };
    }
    const blocks = any[`${synth}Blocks`];
    if (blocks !== undefined) {
      return { kind: `${synth}_blocks`, ...blocksFields(blocks) };
    }
  }
  throw new RangeError("sound: a member is one of an instrument's sounds");
}

const KEYS: readonly string[] = REGISTER_SYNTHS.flatMap((synth) => [synth, `${synth}Live`, `${synth}Blocks`]);

/** Whether a member is an instrument's. */
export function isInstrumentMember(member: object): member is InstrumentMember {
  return KEYS.some((key) => key in member) || SYNTH_KEYS.some((key) => key in member);
}

/** The member as the protocol writes it, checked as the server checks it. */
export function instrumentFields(member: InstrumentMember): WireInstrumentSound {
  return isSynthMember(member) ? synthFields(member) : registerFields(member);
}
