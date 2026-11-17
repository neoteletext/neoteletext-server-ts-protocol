// Every byte of an analogue synthesizer's patch held to the range of the
// control it holds (DEC-6429), by the tables of synth-patch-tables.ts, as
// the server's protocol/check/instrument/patch.rs at neoteletext-app-server
// 2df311a holds it. A receiver plays its default patch in place of one its
// instrument's reader refuses, and says nothing, so a bank is checked here
// where it is made, in the server's words, and again on the wire.

import { SEVEN_BITS, SYNTHS, SYNTH_PATCH_BYTES, type Synth } from "./instrument-profile.ts";
import { type Range, JUNO_FEET_BITS, JUNO_FEET_MASK, TABLES } from "./synth-patch-tables.ts";

/** The bytes a field takes. */
function width(range: Range): number {
  return "signed" in range || "word" in range ? 2 : 1;
}

/** A byte as the server writes it in a fault: 0x and two capital hexadecimal digits. */
function hex(byte: number): string {
  return `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** Why one field's bytes are outside its range; null when they are within it. */
function fieldFault(bytes: Uint8Array, at: number, range: Range): string | null {
  const [low = 0, high = 0] = bytes.subarray(at, at + 2);
  if ("byte" in range) {
    return low > range.byte ? `is ${low}: at most ${range.byte}` : null;
  }
  if ("bits" in range) {
    return (low & ~range.bits) === 0 ? null : `is ${hex(low)}: no bit outside ${hex(range.bits)}`;
  }
  if ("junoFeet" in range) {
    const feet: readonly number[] = Object.values(JUNO_FEET_BITS);
    return low <= SEVEN_BITS && feet.includes(low & JUNO_FEET_MASK)
      ? null
      : `is ${hex(low)}: at most 0x7F, with exactly one of the range bits 0x01 (16'), 0x02 (8') and 0x04 (4')`;
  }
  if ("signed" in range) {
    const value = new DataView(bytes.buffer, bytes.byteOffset + at, 2).getInt16(0, true);
    return Math.abs(value) > range.signed ? `is ${value}: -${range.signed} to ${range.signed}, the low byte first` : null;
  }
  const value = low | (high << 8);
  return value > range.word ? `is ${value}: at most ${range.word}, the low byte first` : null;
}

/** Why one patch of `synth` is not one its instrument reads, naming the byte and its control as the server does ("byte 14 (VCO-2 RANGE) is 37: at most 36"); null when every byte is within its control's range. `patch` is one whole patch. */
export function synthPatchFault(synth: Synth, patch: Uint8Array): string | null {
  if (patch.length !== SYNTH_PATCH_BYTES[synth]) {
    return `is ${patch.length} bytes, not a ${synth} patch's ${SYNTH_PATCH_BYTES[synth]}`;
  }
  for (const [at, name, range] of TABLES[synth]) {
    const why = fieldFault(patch, at, range);
    if (why !== null) {
      return `byte ${at} (${name}) ${why}`;
    }
  }
  return null;
}

/** The first patch of `patches`, whole patches of `synth`, that its instrument would not read, as the server names it ("patch 1 byte 14 (VCO-2 RANGE) is 37: at most 36"); null when every one is read. */
export function synthBankFault(synth: Synth, patches: Uint8Array): string | null {
  const size = SYNTH_PATCH_BYTES[synth];
  for (let index = 0; index * size < patches.length; index += 1) {
    const why = synthPatchFault(synth, patches.subarray(index * size, (index + 1) * size));
    if (why !== null) {
      return `patch ${index} ${why}`;
    }
  }
  return null;
}

/** Each table covers its patch's bytes once, in order: checked when the module loads, as the server's const assertions and test check its own. */
for (const synth of SYNTHS) {
  const covered = TABLES[synth].flatMap(([at, , range]) => Array.from({ length: width(range) }, (_, offset) => at + offset));
  if (covered.length !== SYNTH_PATCH_BYTES[synth] || covered.some((at, index) => at !== index)) {
    throw new RangeError(`${synth}: its patch table does not cover its ${SYNTH_PATCH_BYTES[synth]} bytes once`);
  }
}
