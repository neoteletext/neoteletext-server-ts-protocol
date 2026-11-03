// Whether an Opus packet is one the receivers' decoder takes: mono, one
// 20 ms frame, bare or padded. A port of the engine's neoteletext-opus
// Packet::parse (src/packet.rs, REQ-AUD-022, the engine's E.123 and E.124)
// at the engine commit 4ddd34b the server pins, which the server's
// Sounds::check_opus runs on every packet of a stored or streamed Opus
// sound and refuses with `outside_profile` (REQ-1060).

/** The largest packet the decoder takes (the engine's MAX_PACKET). */
const MAX_PACKET = 160;
/** The TOC byte's stereo flag (RFC 6716 section 3.1). */
const STEREO = 0x04;
/** The TOC byte's frame-count code: one frame, or a count in the next byte (RFC 6716 section 3.1). */
const CODE_MASK = 0x03;
const ONE_FRAME = 0;
const SIGNALLED_FRAMES = 3;
/** A code 3 packet's count byte: the padding flag and the count (RFC 6716 section 3.2.5, Figure 5). */
const PADDING_FLAG = 0x40;
const COUNT_MASK = 0x3f;
/** A padding length of 255 adds 254 bytes and says another length follows. */
const PADDING_CONTINUES = 255;
/** The configuration is the TOC byte's top five bits (RFC 6716 section 3.1, Table 2). */
const CONFIG_SHIFT = 3;
/** SILK's configurations 0 to 11 and hybrid's 12 to 15; CELT's from 16. Each group's sizes repeat every 4, 2 and 4 (Table 2). */
const LAST_SILK = 11;
const LAST_HYBRID = 15;
const SILK_SIZES = 4;
const HYBRID_SIZES = 2;
const CELT_SIZES = 4;
/** The place of 20 ms among each group's sizes: SILK 10, 20, 40, 60; hybrid 10, 20; CELT 2.5, 5, 10, 20 ms. */
const SILK_TWENTY_MS = 1;
const HYBRID_TWENTY_MS = 1;
const CELT_TWENTY_MS = 3;

/** Why a packet is not the profile's, in the server's words (its packet_refusal). */
export type OpusRefusal = "empty" | "over 160 bytes" | "stereo" | "more than one frame" | "malformed" | "a frame other than 20 ms";

/** A code 3 packet's frame: one, its padding inside the packet (the engine's unpad). */
function unpadFault(bytes: Uint8Array): OpusRefusal | null {
  const count = bytes[0];
  if (count === undefined) {
    return "malformed";
  }
  const frames = count & COUNT_MASK;
  if (frames !== 1) {
    return frames === 0 ? "malformed" : "more than one frame";
  }
  let at = 1;
  let padding = 0;
  if ((count & PADDING_FLAG) !== 0) {
    for (;;) {
      const length = bytes[at];
      if (length === undefined) {
        return "malformed";
      }
      at += 1;
      padding += Math.min(length, PADDING_CONTINUES - 1);
      if (length !== PADDING_CONTINUES) {
        break;
      }
    }
  }
  return bytes.length - at < padding ? "malformed" : null;
}

/** Whether configuration `config` codes 20 ms frames (RFC 6716 section 3.1, Table 2). */
function isTwentyMs(config: number): boolean {
  if (config <= LAST_SILK) {
    return config % SILK_SIZES === SILK_TWENTY_MS;
  }
  if (config <= LAST_HYBRID) {
    return config % HYBRID_SIZES === HYBRID_TWENTY_MS;
  }
  return config % CELT_SIZES === CELT_TWENTY_MS;
}

/** Why `packet` is outside the profile, or null when it is in it. */
export function opusRefusal(packet: Uint8Array): OpusRefusal | null {
  const toc = packet[0];
  if (toc === undefined) {
    return "empty";
  }
  if (packet.length > MAX_PACKET) {
    return "over 160 bytes";
  }
  if ((toc & STEREO) !== 0) {
    return "stereo";
  }
  const code = toc & CODE_MASK;
  if (code !== ONE_FRAME && code !== SIGNALLED_FRAMES) {
    return "more than one frame";
  }
  const framing = code === SIGNALLED_FRAMES ? unpadFault(packet.subarray(1)) : null;
  if (framing !== null) {
    return framing;
  }
  return isTwentyMs(toc >> CONFIG_SHIFT) ? null : "a frame other than 20 ms";
}
