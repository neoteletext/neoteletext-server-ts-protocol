import assert from "node:assert/strict";
import { test } from "node:test";

import { ffmpegOpus, MOST_SAMPLES, OggOpusReader, oggCrc, OPUS_FRAME_SAMPLES, OPUS_PACKET_BYTES, type OpusStream, soundFields } from "../src/index.ts";
import { fakeOpus } from "../src/testing/index.ts";

const PACKET = new Uint8Array(OPUS_PACKET_BYTES).fill(7);
/** libopus's pre-skip at 48 kHz, as ffmpeg 8.0.1 writes it (measured 28 October 2026). */
const PRE_SKIP = 312;
/** How long a test waits for ffmpeg at most: a ceiling, not a wait. */
const CEILING_MS = 10_000;
const POLL_MS = 10;

function packets(count: number): Uint8Array {
  return new Uint8Array(count * OPUS_PACKET_BYTES).fill(1);
}

test("the Opus members are written as the server reads them", () => {
  assert.deepEqual(soundFields({ opus: { handle: 4, generation: 1, packetBytes: OPUS_PACKET_BYTES, samples: OPUS_FRAME_SAMPLES + 1, packets: packets(2) } }), {
    opus: { handle: 4, generation: 1, packet_bytes: OPUS_PACKET_BYTES, samples: OPUS_FRAME_SAMPLES + 1, packets: Buffer.from(packets(2)).toString("base64") },
  });
  assert.deepEqual(soundFields({ opusLive: { handle: 255, generation: 3, packetBytes: 40 } }), { opus_live: { handle: 255, generation: 3, packet_bytes: 40 } });
  assert.deepEqual(soundFields({ opusPackets: { handle: 255, generation: 3, packetBytes: 40, first: 9, packets: PACKET } }), {
    opus_packets: { handle: 255, generation: 3, packet_bytes: 40, first: 9, packets: Buffer.from(PACKET).toString("base64") },
  });
});

test("Opus the server would refuse is refused here", () => {
  const good = { handle: 1, generation: 0, packetBytes: OPUS_PACKET_BYTES, samples: OPUS_FRAME_SAMPLES, packets: packets(1) };
  for (const bad of [
    { ...good, packetBytes: OPUS_PACKET_BYTES + 1, packets: new Uint8Array(OPUS_PACKET_BYTES + 1) },
    { ...good, packetBytes: 0 },
    { ...good, packets: new Uint8Array(OPUS_PACKET_BYTES + 1) },
    { ...good, packets: new Uint8Array(0) },
    { ...good, samples: OPUS_FRAME_SAMPLES + 1 },
    { ...good, samples: 0 },
    { ...good, samples: MOST_SAMPLES + 1, packets: packets(Math.ceil((MOST_SAMPLES + 1) / OPUS_FRAME_SAMPLES)) },
  ]) {
    assert.throws(() => soundFields({ opus: bad }), RangeError, JSON.stringify({ ...bad, packets: bad.packets.length }));
  }
  assert.throws(() => soundFields({ opusPackets: { handle: 1, generation: 0, packetBytes: 40, first: 0x1_0000, packets: PACKET } }), RangeError);
  assert.throws(() => soundFields({ opusLive: { handle: 256, generation: 0, packetBytes: 40 } }), RangeError);
});

/** An Ogg page of `segments` (RFC 3533 section 6), its checksum made. */
function page(
  segments: readonly Uint8Array[],
  options: { readonly serial?: number; readonly granule?: bigint; readonly lacing?: readonly number[] } = {},
): Uint8Array {
  const lacing = options.lacing ?? segments.map((segment) => segment.length);
  const body = segments.reduce((sum, segment) => sum + segment.length, 0);
  const bytes = new Uint8Array(27 + lacing.length + body);
  const view = new DataView(bytes.buffer);
  bytes.set([0x4f, 0x67, 0x67, 0x53]);
  view.setBigInt64(6, options.granule ?? 0n, true);
  view.setUint32(14, options.serial ?? 1, true);
  bytes[26] = lacing.length;
  bytes.set(lacing, 27);
  let at = 27 + lacing.length;
  for (const segment of segments) {
    bytes.set(segment, at);
    at += segment.length;
  }
  view.setUint32(22, oggCrc(bytes), true);
  return bytes;
}

function head(channels = 1): Uint8Array {
  const bytes = new Uint8Array(19);
  bytes.set(new TextEncoder().encode("OpusHead"));
  bytes[8] = 1;
  bytes[9] = channels;
  new DataView(bytes.buffer).setUint16(10, PRE_SKIP, true);
  return bytes;
}

const TAGS = new TextEncoder().encode("OpusTags\u0000\u0000\u0000\u0000");

test("an Ogg Opus stream gives its audio packets, put together across pages, with its pre-skip and its length", () => {
  const reader = new OggOpusReader(300, 10);
  const long = new Uint8Array(300).fill(9);
  const stream = [
    page([head()]),
    page([TAGS]),
    page([PACKET]),
    // A 300-byte packet: a full segment of 255, the page ends, and its last 45 bytes on the next page.
    page([long.subarray(0, 255)], { granule: -1n }),
    page([long.subarray(255)], { granule: 2_000n }),
  ];
  const bytes = Buffer.concat(stream);
  for (let at = 0; at < bytes.length; at += 11) {
    reader.push(bytes.subarray(at, at + 11));
  }
  assert.deepEqual(reader.take(), [PACKET, long]);
  assert.deepEqual(reader.take(), [], "taken once");
  assert.equal(reader.preSkip, PRE_SKIP);
  assert.equal(reader.granule, 2_000, "a page that ends no packet leaves the length where it was");
});

test("what is not Ogg Opus as the profile has it is refused", () => {
  const good = [page([head()]), page([TAGS])];
  const broken = page([PACKET]);
  broken[30] = (broken[30] ?? 0) ^ 1;
  for (const [why, pages, longest, most] of [
    ["a wrong checksum", [...good, broken], 40, 10],
    ["a second stream", [...good, page([PACKET], { serial: 2 })], 40, 10],
    ["stereo", [page([head(2)]), page([TAGS])], 40, 10],
    ["no OpusHead", [page([TAGS])], 40, 10],
    ["a packet too long", [...good, page([new Uint8Array(41)])], 40, 10],
    ["too many untaken", [...good, page([PACKET, PACKET])], 40, 1],
  ] as const) {
    const reader = new OggOpusReader(longest, most);
    assert.throws(
      () => {
        for (const each of pages) {
          reader.push(each);
        }
      },
      RangeError,
      why,
    );
  }
  assert.throws(
    () => {
      new OggOpusReader(40, 10).push(new TextEncoder().encode("RIFF0000000000000000000000000000"));
    },
    RangeError,
    "not Ogg",
  );
});

test("ffmpeg encodes a sound as the profile's constant-rate packets, its length the pre-skip and its samples", () => {
  const tone = Int16Array.from({ length: 2_400 }, (_, index) => Math.round(8_000 * Math.sin(index / 2)));
  const encoded = ffmpegOpus().sound(tone, 8_000);
  const samples = 2_400 * 6 + PRE_SKIP;
  assert.equal(encoded.packetBytes, OPUS_PACKET_BYTES);
  assert.equal(encoded.samples, samples);
  assert.equal(encoded.packets.length, Math.ceil(samples / OPUS_FRAME_SAMPLES) * OPUS_PACKET_BYTES);
  assert.doesNotThrow(() => soundFields({ opus: { handle: 0, generation: 0, ...encoded } }), "the server's checks pass");
});

async function until(done: () => boolean): Promise<void> {
  const started = performance.now();
  while (!done() && performance.now() - started < CEILING_MS) {
    // oxlint-disable-next-line no-await-in-loop -- waiting on another program, a poll at a time, ending as soon as it is done
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
}

test("ffmpeg encodes a stream as it is written, every packet out once it ends", async () => {
  const stream: OpusStream = ffmpegOpus().stream(16_000);
  const second = Int16Array.from({ length: 16_000 }, (_, index) => Math.round(8_000 * Math.sin(index / 3)));
  const got: Uint8Array[] = [];
  stream.write(second.subarray(0, 8_000));
  await until(() => {
    got.push(stream.take());
    return got.some((each) => each.length > 0);
  });
  assert.ok(
    got.some((each) => each.length > 0),
    "packets come before the stream ends",
  );
  stream.write(second.subarray(8_000));
  stream.end();
  const expected = Math.ceil((16_000 * 3 + PRE_SKIP) / OPUS_FRAME_SAMPLES) * OPUS_PACKET_BYTES;
  await until(() => {
    got.push(stream.take());
    return got.reduce((sum, each) => sum + each.length, 0) >= expected;
  });
  assert.equal(stream.failure, null);
  assert.equal(
    got.reduce((sum, each) => sum + each.length, 0),
    expected,
  );
  stream.close();
});

test("a stream whose encoder cannot start says why", async () => {
  const stream = ffmpegOpus({ path: "/nonexistent/ffmpeg" }).stream(16_000);
  await until(() => stream.failure !== null);
  assert.match(stream.failure ?? "", /did not start/u);
});

test("the test encoder gives the packets the samples need, numbered, a stream's last part-frame at its end", () => {
  const encoder = fakeOpus();
  const sound = encoder.sound(new Int16Array(8_000), 8_000);
  assert.equal(sound.samples, 48_000);
  assert.equal(sound.packets.length, 50 * OPUS_PACKET_BYTES);
  const stream = encoder.stream(16_000);
  stream.write(new Int16Array(1_700));
  assert.equal(stream.take().length / OPUS_PACKET_BYTES, 5, "whole frames as they are written: 5,100 samples at 48 kHz, five frames of 960");
  stream.end();
  const last = stream.take();
  assert.equal(last.length, OPUS_PACKET_BYTES, "the part-frame at the end");
  assert.equal(last[0], 5, "numbered on from the first");
});
