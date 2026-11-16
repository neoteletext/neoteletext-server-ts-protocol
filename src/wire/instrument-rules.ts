// The server's rules for an instrument's sound that its schema cannot
// state (a port of the server's protocol/check/instrument.rs at
// neoteletext-app-server c54f06c; REQ-6413): exact base64 of whole blocks,
// 1 to 6,000 stored and 1 to 100 in a message of a live sound, every DX7
// slot one the codec takes, and every byte of a patch at most 127. A fault
// is named at the path the server names it, with its rule.

import type { Fault } from "./fault.ts";
import type { WireInstrumentSound } from "./instrument-wire.ts";
import { base64Bytes, isFault } from "./rule-pieces.ts";
import { dx7BlocksFault } from "../sound/dx7-slot.ts";
import {
  DX7_MOST_PATCHES,
  DX7_PATCH_BYTES,
  DX7_SLOT_BYTES,
  MOST_INSTRUMENT_BLOCKS,
  MOST_LIVE_INSTRUMENT_BLOCKS,
  SEVEN_BITS,
  SID_IMAGE_BYTES,
} from "../sound/instrument-profile.ts";

/** Whole blocks of `size` bytes, 1 to `most`, in exact base64 (the server's check_blocks). */
function blocksFault(path: string, text: string, size: number, most: number, what: string): Buffer | Fault {
  const bytes = base64Bytes(path, text, most * size);
  if (isFault(bytes)) {
    return bytes;
  }
  if (bytes.length === 0 || bytes.length % size !== 0) {
    return { path, rule: "wrong_length", detail: `${bytes.length} bytes: whole ${what} of ${size}` };
  }
  return bytes.length / size > most ? { path, rule: "too_long", detail: `${bytes.length / size} ${what}, at most ${most}` } : bytes;
}

function fault(found: Buffer | Fault): Fault | null {
  return isFault(found) ? found : null;
}

/** A DX7 sound's blocks: whole, and every slot empty or a message the codec takes (the server's dx7). */
function slotsFault(text: string, slots: number, most: number): Fault | null {
  const bytes = blocksFault("blocks", text, DX7_SLOT_BYTES * slots, most, "blocks");
  if (isFault(bytes)) {
    return bytes;
  }
  const detail = dx7BlocksFault(bytes, slots);
  return detail === null ? null : { path: "blocks", rule: "outside_profile", detail };
}

/** A bank's patches: whole, and every byte one the instrument's bulk dump can carry (the server's bank). */
function patchesFault(text: string): Fault | null {
  const bytes = blocksFault("patches", text, DX7_PATCH_BYTES, DX7_MOST_PATCHES, "patches");
  if (isFault(bytes)) {
    return bytes;
  }
  const at = bytes.findIndex((byte) => byte > SEVEN_BITS);
  if (at === -1) {
    return null;
  }
  const detail = `patch ${Math.floor(at / DX7_PATCH_BYTES)} byte ${at % DX7_PATCH_BYTES} is ${bytes[at]}: at most ${SEVEN_BITS}`;
  return { path: "patches", rule: "outside_profile", detail };
}

const KINDS: readonly string[] = [
  "sid",
  "sid_live",
  "sid_blocks",
  "dx7",
  "dx7_live",
  "dx7_blocks",
  "dx7_bank",
] satisfies readonly WireInstrumentSound["kind"][];

/** Whether a sound is an instrument's. */
export function isInstrumentKind<T extends { readonly kind: string }>(sound: T): sound is Extract<T, WireInstrumentSound> {
  return KINDS.includes(sound.kind);
}

/** The first fault of an instrument's sound the schema has passed; null when it has none. */
export function instrumentFault(sound: WireInstrumentSound): Fault | null {
  if (sound.kind === "sid" || sound.kind === "sid_blocks") {
    const most = sound.kind === "sid" ? MOST_INSTRUMENT_BLOCKS : MOST_LIVE_INSTRUMENT_BLOCKS;
    return fault(blocksFault("images", sound.images, SID_IMAGE_BYTES * sound.images_per_block, most, "blocks"));
  }
  if (sound.kind === "dx7" || sound.kind === "dx7_blocks") {
    return slotsFault(sound.blocks, sound.slots, sound.kind === "dx7" ? MOST_INSTRUMENT_BLOCKS : MOST_LIVE_INSTRUMENT_BLOCKS);
  }
  return sound.kind === "dx7_bank" ? patchesFault(sound.patches) : null;
}
