// The Opus packets a program sends are the server's to judge (typescript.md
// TS-17; DEC-6477 answer 5): each must be the profile's (mono, one 20 ms
// frame, bare or padded; the engine's neoteletext-opus Packet::parse, which
// the server's Sounds::check_opus runs and refuses with outside_profile),
// and the kit holds them to the schema alone. Real packets from the kit's
// own encoder (ffmpeg's libopus, on this machine) pass the schema
// (TODO-2212; REQ-1060).

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProgram, ffmpegOpus, OPUS_PACKET_BYTES } from "../src/index.ts";
import { SERVER_LIMITS } from "../src/testing/index.ts";

/** TOC bytes (RFC 6716 section 3.1, Table 2): configuration in the top five bits, the stereo flag, the frame-count code. */
const HYBRID_FULLBAND_20_MS = 15 << 3;
const SILK_NARROWBAND_10_MS = 0 << 3;
const CELT_FULLBAND_20_MS = 31 << 3;
const STEREO = 0x04;
const CODE_TWO_FRAMES = 2;
const CODE_SIGNALLED = 3;

function stored(packets: Uint8Array, packetBytes: number): unknown {
  return {
    type: "sound",
    connections: [1],
    kind: "opus",
    handle: 0,
    generation: 0,
    packet_bytes: packetBytes,
    samples: (packets.length / packetBytes) * 960,
    packets: Buffer.from(packets).toString("base64"),
  };
}

/** One packet of `OPUS_PACKET_BYTES`: `head`, then zeros. */
function packetOf(head: readonly number[]): Uint8Array {
  const packet = new Uint8Array(OPUS_PACKET_BYTES);
  packet.set(head);
  return packet;
}

test("TODO-2212: real Opus from the kit's encoder is the profile's, and the server's checks pass it", () => {
  const tone = Int16Array.from({ length: 48_000 }, (_, index) => Math.round(8_000 * Math.sin((2 * Math.PI * 440 * index) / 48_000)));
  const encoded = ffmpegOpus().sound(tone, 48_000);
  assert.equal(encoded.packet_bytes, OPUS_PACKET_BYTES);
  assert.equal(checkProgram(stored(encoded.packets, encoded.packet_bytes), SERVER_LIMITS), null);
  assert.equal(
    checkProgram(
      {
        type: "sound",
        connections: [1],
        kind: "opus_packets",
        handle: 0,
        generation: 0,
        packet_bytes: encoded.packet_bytes,
        first: 0,
        packets: Buffer.from(encoded.packets).toString("base64"),
      },
      SERVER_LIMITS,
    ),
    null,
  );
});

test("TS-17: a packet outside the profile is held to the schema alone, and written: the server refuses it", () => {
  for (const head of [
    [HYBRID_FULLBAND_20_MS | STEREO],
    [HYBRID_FULLBAND_20_MS | CODE_TWO_FRAMES],
    [HYBRID_FULLBAND_20_MS | CODE_SIGNALLED, 0],
    [SILK_NARROWBAND_10_MS],
    [CELT_FULLBAND_20_MS],
  ]) {
    const packets = new Uint8Array([...packetOf([HYBRID_FULLBAND_20_MS]), ...packetOf(head)]);
    assert.equal(checkProgram(stored(packets, OPUS_PACKET_BYTES), SERVER_LIMITS), null, head.join(" "));
  }
});
