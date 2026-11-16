// The instrument members as the protocol writes them (REQ-6414; the
// server's REQ-6413): bytes as base64, each member checked here as the
// server checks it, the same bounds and the same rule for a DX7 slot, so
// a mistake is a RangeError where it is made rather than a refusal in the
// server's log.

import { dx7BlocksFault } from "./dx7-slot.ts";
import type { Dx7Bank, Dx7Blocks, Dx7Live, Dx7Sound, InstrumentMember, SidBlocks, SidChip, SidClock, SidLive, SidSound } from "./instrument-members.ts";
import {
  DX7_MOST_PATCHES,
  DX7_MOST_SLOTS,
  DX7_PATCH_BYTES,
  DX7_SLOT_BYTES,
  type ImagesPerBlock,
  MOST_INSTRUMENT_BLOCKS,
  MOST_LIVE_INSTRUMENT_BLOCKS,
  SEVEN_BITS,
  SID_IMAGE_BYTES,
  SID_IMAGES_PER_BLOCK,
} from "./instrument-profile.ts";
import { LAST_BLOCK, LAST_GENERATION, LAST_HANDLE } from "./profile.ts";
import type { WireInstrumentSound } from "../wire/instrument-wire.ts";

const CHIPS: readonly string[] = ["6581", "8580"] satisfies readonly SidChip[];
const CLOCKS: readonly string[] = ["pal", "ntsc"] satisfies readonly SidClock[];

function wholeIn(name: string, value: number, least: number, most: number): number {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`sound: ${name} is ${least} to ${most}, not ${value}`);
  }
  return value;
}

function handleFields(sound: { readonly handle: number; readonly generation: number }): { readonly handle: number; readonly generation: number } {
  return { handle: wholeIn("handle", sound.handle, 0, LAST_HANDLE), generation: wholeIn("generation", sound.generation, 0, LAST_GENERATION) };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

/** `bytes` as base64, once they are whole things of `size` bytes, 1 to `most` of them. */
function whole(name: string, bytes: Uint8Array, size: number, most: number, what: string): string {
  if (bytes.length === 0 || bytes.length % size !== 0) {
    throw new RangeError(`sound: ${name} are whole ${what} of ${size} bytes, not ${bytes.length} bytes`);
  }
  if (bytes.length / size > most) {
    throw new RangeError(`sound: ${name} are at most ${most} ${what}, not ${bytes.length / size}`);
  }
  return base64(bytes);
}

function imagesPerBlockOf(imagesPerBlock: ImagesPerBlock | undefined): ImagesPerBlock {
  const images = imagesPerBlock ?? 1;
  if (!SID_IMAGES_PER_BLOCK.includes(images)) {
    throw new RangeError(`sound: images_per_block is 1, 2 or 4, not ${images}`);
  }
  return images;
}

function listed<T extends string>(name: string, value: T, list: readonly string[]): T {
  if (!list.includes(value)) {
    throw new RangeError(`sound: ${name} is one of ${list.join(", ")}, not ${value}`);
  }
  return value;
}

function sidLiveFields(live: SidLive): Omit<Extract<WireInstrumentSound, { kind: "sid_live" }>, "kind"> {
  return {
    ...handleFields(live),
    images_per_block: imagesPerBlockOf(live.imagesPerBlock),
    chip: listed("chip", live.chip ?? "6581", CHIPS),
    clock: listed("clock", live.clock ?? "pal", CLOCKS),
  };
}

function sidFields(sid: SidSound): WireInstrumentSound {
  const fields = sidLiveFields(sid);
  return { kind: "sid", ...fields, images: whole("images", sid.images, SID_IMAGE_BYTES * fields.images_per_block, MOST_INSTRUMENT_BLOCKS, "blocks") };
}

function sidBlocksFields(blocks: SidBlocks): WireInstrumentSound {
  const imagesPerBlock = imagesPerBlockOf(blocks.imagesPerBlock);
  return {
    kind: "sid_blocks",
    ...handleFields(blocks),
    images_per_block: imagesPerBlock,
    first: wholeIn("first", blocks.first, 0, LAST_BLOCK),
    images: whole("images", blocks.images, SID_IMAGE_BYTES * imagesPerBlock, MOST_LIVE_INSTRUMENT_BLOCKS, "blocks"),
  };
}

/** A DX7 sound's blocks as base64, once they are whole and every slot is one the codec takes. */
function slotBlocks(blocks: Uint8Array, slots: number, most: number): string {
  const text = whole("blocks", blocks, DX7_SLOT_BYTES * slots, most, "blocks");
  const fault = dx7BlocksFault(blocks, slots);
  if (fault !== null) {
    throw new RangeError(`sound: blocks: ${fault}`);
  }
  return text;
}

function dx7LiveFields(live: Dx7Live): Omit<Extract<WireInstrumentSound, { kind: "dx7_live" }>, "kind"> {
  return { ...handleFields(live), slots: wholeIn("slots", live.slots, 1, DX7_MOST_SLOTS), bank: wholeIn("bank", live.bank, 0, LAST_HANDLE) };
}

function dx7Fields(dx7: Dx7Sound): WireInstrumentSound {
  const fields = dx7LiveFields(dx7);
  return { kind: "dx7", ...fields, blocks: slotBlocks(dx7.blocks, fields.slots, MOST_INSTRUMENT_BLOCKS) };
}

function dx7BlocksFields(blocks: Dx7Blocks): WireInstrumentSound {
  const slots = wholeIn("slots", blocks.slots, 1, DX7_MOST_SLOTS);
  return {
    kind: "dx7_blocks",
    ...handleFields(blocks),
    slots,
    first: wholeIn("first", blocks.first, 0, LAST_BLOCK),
    blocks: slotBlocks(blocks.blocks, slots, MOST_LIVE_INSTRUMENT_BLOCKS),
  };
}

function dx7BankFields(bank: Dx7Bank): WireInstrumentSound {
  const patches = whole("patches", bank.patches, DX7_PATCH_BYTES, DX7_MOST_PATCHES, "patches");
  const at = bank.patches.findIndex((byte) => byte > SEVEN_BITS);
  if (at !== -1) {
    throw new RangeError(
      `sound: patches: patch ${Math.floor(at / DX7_PATCH_BYTES)} byte ${at % DX7_PATCH_BYTES} is ${bank.patches[at]}: at most ${SEVEN_BITS}`,
    );
  }
  return { kind: "dx7_bank", ...handleFields(bank), patches };
}

const KEYS = ["sid", "sidLive", "sidBlocks", "dx7", "dx7Live", "dx7Blocks", "dx7Bank"] as const;

/** Whether a member is an instrument's. */
export function isInstrumentMember(member: object): member is InstrumentMember {
  return KEYS.some((key) => key in member);
}

/** The member as the protocol writes it, checked as the server checks it. */
export function instrumentFields(member: InstrumentMember): WireInstrumentSound {
  if ("sid" in member) {
    return sidFields(member.sid);
  }
  if ("sidLive" in member) {
    return { kind: "sid_live", ...sidLiveFields(member.sidLive) };
  }
  if ("sidBlocks" in member) {
    return sidBlocksFields(member.sidBlocks);
  }
  if ("dx7" in member) {
    return dx7Fields(member.dx7);
  }
  if ("dx7Live" in member) {
    return { kind: "dx7_live", ...dx7LiveFields(member.dx7Live) };
  }
  if ("dx7Blocks" in member) {
    return dx7BlocksFields(member.dx7Blocks);
  }
  return dx7BankFields(member.dx7Bank);
}
