// A bank of synth7 patches from the instrument's own bulk dump (REQ-6414
// item 3): the System Exclusive message of 32 voices, 4,104 bytes, that
// every synth7 bank file holds (Yamaha's DX7 MIDI data format sheet, "Bulk
// data for 32 voices"). What a file holds is untrusted: its length, its
// header, its checksum and its end are each checked before a byte is used.

import { MOST_PATCHES, SYNTH7_PATCH_BYTES, SEVEN_BITS } from "./instrument-profile.ts";

/** The message's first bytes: System Exclusive, the maker's identity, then the sub-status (0) with the MIDI channel in its low four bits. */
const SYSTEM_EXCLUSIVE = 0xf0;
const MAKER = 0x43;
const CHANNEL_BITS = 0x0f;
/** Format 9 is 32 voices; its byte count, 4,096, is written as two bytes of 7 bits, 0x20 and 0x00. */
const FORMAT_32_VOICES = 0x09;
const COUNT_HIGH = 0x20;
const COUNT_LOW = 0x00;
const END_OF_EXCLUSIVE = 0xf7;
/** The six bytes before the data. */
const HEADER_BYTES = 6;
/** The data: 32 patches of 128 bytes. */
const DATA_BYTES = MOST_PATCHES * SYNTH7_PATCH_BYTES;
/** The whole dump: the header, the data, a checksum and the end byte. */
export const SYNTH7_SYSEX_BYTES = HEADER_BYTES + DATA_BYTES + 2;

/** The checksum of a dump's data: the two's complement of the bytes' sum, in 7 bits. */
function checksum(data: Uint8Array): number {
  let sum = 0;
  for (const byte of data) {
    sum = (sum + byte) & SEVEN_BITS;
  }
  return -sum & SEVEN_BITS;
}

function headerFault(bytes: Uint8Array): string | null {
  const [start, maker, channel = 0, format, high, low] = bytes;
  if (start !== SYSTEM_EXCLUSIVE || maker !== MAKER) {
    return "it does not begin F0 43, a System Exclusive message of the instrument's maker";
  }
  if ((channel & ~CHANNEL_BITS) !== 0) {
    return "its third byte is not a bulk dump's sub-status with a MIDI channel";
  }
  if (format !== FORMAT_32_VOICES || high !== COUNT_HIGH || low !== COUNT_LOW) {
    return "it is not format 9, 32 voices in 4,096 bytes";
  }
  return null;
}

/** The 4,096 bytes of 32 packed patches in a 32-voice bulk dump, sent on any MIDI channel: what a `synth7Bank` member carries. Refused for a wrong length, header, checksum or end byte, or a data byte above 127. */
export function synth7BankFromSysex(bytes: Uint8Array): Uint8Array {
  if (bytes.length !== SYNTH7_SYSEX_BYTES) {
    throw new RangeError(`synth7 bank: a 32-voice dump is ${SYNTH7_SYSEX_BYTES} bytes, not ${bytes.length}`);
  }
  const fault = headerFault(bytes);
  if (fault !== null) {
    throw new RangeError(`synth7 bank: ${fault}`);
  }
  const data = bytes.slice(HEADER_BYTES, HEADER_BYTES + DATA_BYTES);
  const high = data.findIndex((byte) => byte > SEVEN_BITS);
  if (high !== -1) {
    throw new RangeError(`synth7 bank: data byte ${high} is ${data[high]}: at most ${SEVEN_BITS}`);
  }
  const given = bytes[HEADER_BYTES + DATA_BYTES];
  if (given !== checksum(data)) {
    throw new RangeError(`synth7 bank: its checksum is ${given}, and its data's is ${checksum(data)}`);
  }
  if (bytes.at(-1) !== END_OF_EXCLUSIVE) {
    throw new RangeError("synth7 bank: it does not end F7");
  }
  return data;
}

/** The patches of `bank` at the places `order` names, in that order, back to back: a bank of a chosen few, or the same ones rearranged. */
export function synth7Patches(bank: Uint8Array, order: readonly number[]): Uint8Array {
  const count = bank.length / SYNTH7_PATCH_BYTES;
  if (!Number.isInteger(count) || order.length === 0 || order.length > MOST_PATCHES) {
    throw new RangeError(`synth7 bank: 1 to ${MOST_PATCHES} patches are chosen from whole patches of ${SYNTH7_PATCH_BYTES} bytes`);
  }
  const chosen = new Uint8Array(order.length * SYNTH7_PATCH_BYTES);
  for (const [index, patch] of order.entries()) {
    if (!Number.isInteger(patch) || patch < 0 || patch >= count) {
      throw new RangeError(`synth7 bank: it has patches 0 to ${count - 1}, not ${patch}`);
    }
    chosen.set(bank.subarray(patch * SYNTH7_PATCH_BYTES, (patch + 1) * SYNTH7_PATCH_BYTES), index * SYNTH7_PATCH_BYTES);
  }
  return chosen;
}
