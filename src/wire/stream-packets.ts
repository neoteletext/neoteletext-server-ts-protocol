// Whether 42 bytes are a packet a channel's T42 stream may carry: a port of
// the engine's neoteletext-core is_valid_stream_packet (src/packet.rs) and
// its Hamming 8/4 decoding (src/ecc.rs) at the engine commit 4ddd34b the
// server pins, which the server's check.rs uses to refuse a `packets`
// message's packet (REQ-1462).

/** A packet's bytes after the clock run-in and framing code (EN 300 706 clause 7.1; the engine's consts::PACKET_BYTES). */
export const PACKET_BYTES = 42;
/** The two Hamming 8/4 address bytes come first (clause 7.1.2). */
const ADDRESS_BYTE_0 = 0;
const ADDRESS_BYTE_1 = 1;
/** The magazine's three bits and the packet number's low bit of the first address byte's data (clause 7.1.2). */
const MAGAZINE_MASK = 0x07;
const PACKET_NUMBER_LOW_BIT = 0x08;
const PACKET_NUMBER_LOW_SHIFT = 3;
/** Magazine bits 000 are magazine 8 (clause 7.1.2). */
const MAGAZINE_ZERO_IS = 8;
/** Packets X/0 to X/28 and M/29 are a page's and a magazine's (clause 7.1.2). */
const PACKET_MAGAZINE_ENHANCEMENT = 29;
/** Packet 8/30, the broadcast service data (clause 9.8). */
const PACKET_SERVICE = 30;
const SERVICE_MAGAZINE = 8;
/** Packet 4/31, independent data channel 12, the audio profile's (EN 300 708 clause 6.4.2). */
const PACKET_INDEPENDENT_DATA = 31;
const INDEPENDENT_AUDIO_MAGAZINE = 4;
const BYTE_BITS = 8;

function bit(byte: number, place: number): number {
  return (byte >> place) & 1;
}

function ones(byte: number): number {
  let count = 0;
  for (let place = 0; place < BYTE_BITS; place += 1) {
    count += bit(byte, place);
  }
  return count;
}

/** D1 to D4 of a Hamming 8/4 byte, bits 1, 3, 5 and 7 (clause 8.2). */
function data(byte: number): number {
  return bit(byte, 1) | (bit(byte, 3) << 1) | (bit(byte, 5) << 2) | (bit(byte, 7) << 3);
}

/** The bit each set of failing tests A, B and C names (clause 8.2). */
const FLIP_BY_FAILING: Readonly<Record<number, number>> = { 0b001: 1, 0b010: 1 << 2, 0b100: 1 << 4, 0b111: 1 << 1, 0b110: 1 << 3, 0b101: 1 << 5 };
/** Tests A and B alone name D4, bit 7. */
const D4 = 1 << 7;

/** A Hamming 8/4 byte's four data bits, corrected where one bit is wrong, or null where it cannot be (clause 8.2; the engine's hamming84). */
function hamming84(byte: number): number | null {
  const a = bit(byte, 0) ^ bit(byte, 1) ^ bit(byte, 5) ^ bit(byte, 7);
  const b = bit(byte, 1) ^ bit(byte, 2) ^ bit(byte, 3) ^ bit(byte, 7);
  const c = bit(byte, 1) ^ bit(byte, 3) ^ bit(byte, 4) ^ bit(byte, 5);
  const passes = a === 1 && b === 1 && c === 1;
  if (ones(byte) % 2 === 1) {
    // Overall parity right: no error, or two.
    return passes ? data(byte) : null;
  }
  if (passes) {
    // Only test D failed: the error is in P4.
    return data(byte);
  }
  const failing = (1 ^ a) | ((1 ^ b) << 1) | ((1 ^ c) << 2);
  return data(byte ^ (FLIP_BY_FAILING[failing] ?? D4));
}

/** Whether `packet`, 42 bytes, is one a stream may carry: an address that decodes, and X/0 to X/28, M/29, 8/30 or 4/31. */
export function isValidStreamPacket(packet: Uint8Array): boolean {
  const first = hamming84(packet[ADDRESS_BYTE_0] ?? 0);
  const second = hamming84(packet[ADDRESS_BYTE_1] ?? 0);
  if (packet.length !== PACKET_BYTES || first === null || second === null) {
    return false;
  }
  const number = ((first & PACKET_NUMBER_LOW_BIT) >> PACKET_NUMBER_LOW_SHIFT) | (second << 1);
  const bits = first & MAGAZINE_MASK;
  const magazine = bits === 0 ? MAGAZINE_ZERO_IS : bits;
  if (number <= PACKET_MAGAZINE_ENHANCEMENT) {
    return true;
  }
  if (number === PACKET_SERVICE) {
    return magazine === SERVICE_MAGAZINE;
  }
  return number === PACKET_INDEPENDENT_DATA && magazine === INDEPENDENT_AUDIO_MAGAZINE;
}
