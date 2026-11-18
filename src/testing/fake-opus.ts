// An Opus encoder for tests: no program run and no time taken, packets of
// the profile's length and count for the samples given, each a TOC byte of
// the profile (one mono 20 ms frame, RFC 6716 section 3.1) and then its
// number, so a test can say which packets went and in what order. Its
// frames are not Opus a decoder would make sound of, but they pass the
// profile's check, as the kit and the server make it before decoding.

import type { EncodedOpus, OpusEncoder, OpusStream } from "../sound/opus-encoder.ts";
import { OPUS_FRAME_SAMPLES, OPUS_PACKET_BYTES, OPUS_RATE, type SampleRate } from "../sound/profile.ts";

/** A packet's bytes after its TOC byte are its number, from 0, wrapping at a byte. */
const BYTE_WRAP = 0x100;
/** Configuration 15, hybrid fullband 20 ms, code 0: one mono frame (RFC 6716 section 3.1, Table 2). */
const PROFILE_TOC = 15 << 3;

function packetsFrom(first: number, count: number): Uint8Array {
  const packets = new Uint8Array(count * OPUS_PACKET_BYTES);
  for (let index = 0; index < count; index += 1) {
    packets.fill((first + index) % BYTE_WRAP, index * OPUS_PACKET_BYTES, (index + 1) * OPUS_PACKET_BYTES);
    packets[index * OPUS_PACKET_BYTES] = PROFILE_TOC;
  }
  return packets;
}

/** `samples` at `rate`, as so many samples at OPUS_RATE. */
function atOpusRate(samples: number, rate: SampleRate): number {
  return Math.round((samples * OPUS_RATE) / rate);
}

class FakeStream implements OpusStream {
  readonly packetBytes = OPUS_PACKET_BYTES;
  readonly failure: string | null = null;
  readonly #rate: SampleRate;
  #written = 0;
  #made = 0;
  #ended = false;

  constructor(rate: SampleRate) {
    this.#rate = rate;
  }

  write(samples: Int16Array): void {
    this.#written += samples.length;
  }

  end(): void {
    this.#ended = true;
  }

  take(): Uint8Array {
    const held = atOpusRate(this.#written, this.#rate);
    const due = this.#ended ? Math.ceil(held / OPUS_FRAME_SAMPLES) : Math.floor(held / OPUS_FRAME_SAMPLES);
    const packets = packetsFrom(this.#made, Math.max(0, due - this.#made));
    this.#made = Math.max(this.#made, due);
    return packets;
  }

  close(): void {
    this.#ended = true;
  }
}

/** An encoder for tests: whole frames as they are written, the last part-frame at the end. */
export function fakeOpus(): OpusEncoder {
  return {
    sound(samples: Int16Array, rate: SampleRate): EncodedOpus {
      const length = Math.max(1, atOpusRate(samples.length, rate));
      return { packet_bytes: OPUS_PACKET_BYTES, samples: length, packets: packetsFrom(0, Math.ceil(length / OPUS_FRAME_SAMPLES)) };
    },
    stream: (rate) => new FakeStream(rate),
  };
}
