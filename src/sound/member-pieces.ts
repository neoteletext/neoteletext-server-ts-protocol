// What every instrument member's fields are made with (REQ-6414,
// DEC-6429): a number held to its range, a handle and generation, bytes as
// base64 once they are whole, a name from its list, and blocks of slots
// held to their instrument's codec. A fault is a RangeError that names the
// field, as the server would refuse it.

import type { SynthLive } from "./instrument-members.ts";
import { MOST_SLOTS, SLOT_BYTES, type Synth } from "./instrument-profile.ts";
import { LAST_GENERATION, LAST_HANDLE } from "./profile.ts";
import { instrumentBlocksFault } from "./synth7-slot.ts";
import type { WireSynthSound } from "../wire/instrument-wire.ts";

export function wholeIn(name: string, value: number, least: number, most: number): number {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`sound: ${name} is ${least} to ${most}, not ${value}`);
  }
  return value;
}

export function handleFields(sound: { readonly handle: number; readonly generation: number }): { readonly handle: number; readonly generation: number } {
  return { handle: wholeIn("handle", sound.handle, 0, LAST_HANDLE), generation: wholeIn("generation", sound.generation, 0, LAST_GENERATION) };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

/** `bytes` as base64, once they are whole things of `size` bytes, 1 to `most` of them. */
export function whole(name: string, bytes: Uint8Array, size: number, most: number, what: string): string {
  if (bytes.length === 0 || bytes.length % size !== 0) {
    throw new RangeError(`sound: ${name} are whole ${what} of ${size} bytes, not ${bytes.length} bytes`);
  }
  if (bytes.length / size > most) {
    throw new RangeError(`sound: ${name} are at most ${most} ${what}, not ${bytes.length / size}`);
  }
  return base64(bytes);
}

export function listed<T extends string>(name: string, value: T, list: readonly string[]): T {
  if (!list.includes(value)) {
    throw new RangeError(`sound: ${name} is one of ${list.join(", ")}, not ${value}`);
  }
  return value;
}

/** A sound's blocks of slots as base64, once they are whole and every slot is one `instrument`'s codec takes. */
export function slotBlocks(blocks: Uint8Array, slots: number, most: number, instrument: Synth): string {
  const text = whole("blocks", blocks, SLOT_BYTES * slots, most, "blocks");
  const fault = instrumentBlocksFault(blocks, slots, instrument);
  if (fault !== null) {
    throw new RangeError(`sound: blocks: ${fault}`);
  }
  return text;
}

export function synthLiveFields(live: SynthLive): Omit<Extract<WireSynthSound, { kind: "synth7_live" }>, "kind"> {
  return { ...handleFields(live), slots: wholeIn("slots", live.slots, 1, MOST_SLOTS), bank: wholeIn("bank", live.bank, 0, LAST_HANDLE) };
}
