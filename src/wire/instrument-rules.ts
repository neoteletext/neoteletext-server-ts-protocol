// The server's rules for an instrument's sound that its schema cannot
// state (a port of the server's protocol/check/instrument.rs at
// neoteletext-app-server e2f5e1b; REQ-6413, DEC-6429): exact base64 of
// whole blocks, 1 to 6,000 stored and 1 to 100 in a message of a live
// sound, every slot one the instrument's codec takes, every byte of a synth7
// patch at most 127, and every byte of a synthesizer's patch within its
// control's range. A fault is named at the path the server names it, with
// its rule.

import type { Fault } from "./fault.ts";
import type { WireInstrumentSound, WireSynthSound } from "./instrument-wire.ts";
import { base64Bytes, isFault } from "./rule-pieces.ts";
import {
  MOST_INSTRUMENT_BLOCKS,
  MOST_LIVE_INSTRUMENT_BLOCKS,
  MOST_PATCHES,
  REGISTER_SYNTHS,
  SLOT_BYTES,
  SYNTH6581_IMAGE_BYTES,
  SYNTHS,
  SYNTH_PATCH_BYTES,
  type Synth,
} from "../sound/instrument-profile.ts";
import { synthBankFault } from "../sound/synth-patch-rules.ts";
import { instrumentBlocksFault } from "../sound/synth7-slot.ts";

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

/** A sound's blocks of slots: whole, and every slot empty or a message `instrument`'s codec takes (the server's timed). */
function slotsFault(text: string, slots: number, most: number, instrument: Synth): Fault | null {
  const bytes = blocksFault("blocks", text, SLOT_BYTES * slots, most, "blocks");
  if (isFault(bytes)) {
    return bytes;
  }
  const detail = instrumentBlocksFault(bytes, slots, instrument);
  return detail === null ? null : { path: "blocks", rule: "outside_profile", detail };
}

/** A synthesizer's bank's patches: whole, and every byte one its instrument reads (the server's bank and synth_bank). */
function synthPatchesFault(synth: Synth, text: string): Fault | null {
  const bytes = blocksFault("patches", text, SYNTH_PATCH_BYTES[synth], MOST_PATCHES, "patches");
  if (isFault(bytes)) {
    return bytes;
  }
  const detail = synthBankFault(synth, bytes);
  return detail === null ? null : { path: "patches", rule: "outside_profile", detail };
}

/** The synthesizer a kind is of: its name, alone or before an underscore. */
function synthOf(kind: string): Synth | undefined {
  return SYNTHS.find((synth) => kind === synth || kind.startsWith(`${synth}_`));
}

/** A synthesizer's sound: its blocks, or its bank's patches; a live sound's object carries neither. */
function synthFault(synth: Synth, sound: WireSynthSound): Fault | null {
  if ("patches" in sound) {
    return synthPatchesFault(synth, sound.patches);
  }
  if ("blocks" in sound) {
    return slotsFault(sound.blocks, sound.slots, "first" in sound ? MOST_LIVE_INSTRUMENT_BLOCKS : MOST_INSTRUMENT_BLOCKS, synth);
  }
  return null;
}

const SYNTH_KINDS: readonly string[] = SYNTHS.flatMap((synth) => [synth, `${synth}_live`, `${synth}_blocks`, `${synth}_bank`]);
const REGISTER_KINDS: readonly string[] = REGISTER_SYNTHS.flatMap((synth) => [synth, `${synth}_live`, `${synth}_blocks`]);
const KINDS: ReadonlySet<string> = new Set([...SYNTH_KINDS, ...REGISTER_KINDS]);

/** Whether a sound is an instrument's. */
export function isInstrumentKind<T extends { readonly kind: string }>(sound: T): sound is Extract<T, WireInstrumentSound> {
  return KINDS.has(sound.kind);
}

/** The first fault of an instrument's sound the schema has passed; null when it has none. */
export function instrumentFault(sound: WireInstrumentSound): Fault | null {
  if ("images" in sound) {
    const most = "first" in sound ? MOST_LIVE_INSTRUMENT_BLOCKS : MOST_INSTRUMENT_BLOCKS;
    return fault(blocksFault("images", sound.images, SYNTH6581_IMAGE_BYTES * sound.images_per_block, most, "blocks"));
  }
  const synth = synthOf(sound.kind);
  return synth !== undefined && !("images_per_block" in sound) ? synthFault(synth, sound) : null;
}
