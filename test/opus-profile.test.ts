// The Opus packets a program sends are judged as the server judges them:
// each must be the profile's (mono, one 20 ms frame, bare or padded; the
// engine's neoteletext-opus Packet::parse, which the server's
// Sounds::check_opus runs and refuses with outside_profile). Real packets
// from the kit's own encoder (ffmpeg's libopus, on this machine) pass, and
// a packet of each kind outside the profile is refused before it is sent
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
const CODE_TWO_EQUAL_FRAMES = 1;
const CODE_TWO_FRAMES = 2;
const CODE_SIGNALLED = 3;
/** A code 3 count byte: the padding flag and a count of frames (RFC 6716 section 3.2.5). */
const PADDED = 0x40;

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
  assert.equal(encoded.packetBytes, OPUS_PACKET_BYTES);
  assert.equal(checkProgram(stored(encoded.packets, encoded.packetBytes), SERVER_LIMITS), null);
  assert.equal(
    checkProgram(
      {
        type: "sound",
        connections: [1],
        kind: "opus_packets",
        handle: 0,
        generation: 0,
        packet_bytes: encoded.packetBytes,
        first: 0,
        packets: Buffer.from(encoded.packets).toString("base64"),
      },
      SERVER_LIMITS,
    ),
    null,
  );
});

test("TODO-2212: a packet outside the profile is refused outside_profile, as the server refuses it, naming the packet and why", () => {
  for (const head of [[HYBRID_FULLBAND_20_MS], [CELT_FULLBAND_20_MS], [HYBRID_FULLBAND_20_MS | CODE_SIGNALLED, PADDED | 1, 2]]) {
    assert.equal(checkProgram(stored(packetOf(head), OPUS_PACKET_BYTES), SERVER_LIMITS), null, `${head.join(" ")} is the profile's`);
  }
  const refusals: [readonly number[], string][] = [
    [[HYBRID_FULLBAND_20_MS | STEREO], "stereo"],
    [[HYBRID_FULLBAND_20_MS | CODE_TWO_EQUAL_FRAMES], "more than one frame"],
    [[HYBRID_FULLBAND_20_MS | CODE_TWO_FRAMES], "more than one frame"],
    [[HYBRID_FULLBAND_20_MS | CODE_SIGNALLED, 2], "more than one frame"],
    [[HYBRID_FULLBAND_20_MS | CODE_SIGNALLED, 0], "malformed"],
    [[HYBRID_FULLBAND_20_MS | CODE_SIGNALLED, PADDED | 1, 200], "malformed"],
    [[SILK_NARROWBAND_10_MS], "a frame other than 20 ms"],
  ];
  for (const [head, why] of refusals) {
    const packets = new Uint8Array([...packetOf([HYBRID_FULLBAND_20_MS]), ...packetOf(head)]);
    assert.deepEqual(checkProgram(stored(packets, OPUS_PACKET_BYTES), SERVER_LIMITS), {
      path: "",
      rule: "outside_profile",
      detail: `packet 1 is outside the Opus profile: ${why}`,
    });
  }
});
