// Opus encoded by ffmpeg's libopus, as the server's documentation has it
// (docs/applications.md section 3.4): constant rate at the profile's 16
// kbit/s, one 20 ms frame a packet, at 48 kHz, read out of the Ogg stream
// ffmpeg writes (ogg-opus.ts). ffmpeg is another program, so what it
// writes is checked and bounded as any input is.
//
// For a stream, ffmpeg is told to read and write as it goes: measured on
// 28 October 2026 (ffmpeg 8.0.1), it otherwise held every packet until its
// input ended; with its probing cut to nothing and a page a packet, each
// packet came out within a few milliseconds of its samples going in. Its
// `-fflags +nobuffer` was tried too and lost packets, so it is not used.

import { spawn, spawnSync } from "node:child_process";

import { OggOpusReader } from "./ogg-opus.ts";
import type { EncodedOpus, OpusEncoder, OpusStream } from "./opus-encoder.ts";
import { MOST_OPUS_PACKETS, MOST_SAMPLES, OPUS_BITRATE, OPUS_FRAME_MS, OPUS_FRAME_SAMPLES, OPUS_PACKET_BYTES, OPUS_RATE, type SampleRate } from "./profile.ts";
import { pcmBytes } from "./pcm.ts";

/** Microseconds in a millisecond: ffmpeg's Ogg page duration is in microseconds. */
const MILLISECOND_US = 1_000;

/** ffmpeg's least `-probesize`: it starts on its input as soon as any of it comes. */
const LEAST_PROBE_BYTES = 32;

/** What of ffmpeg's complaint is kept: its last lines, enough to say why. */
const KEPT_COMPLAINT = 400;

/** Ogg's overhead on a packet on a page of its own: the header and one lacing value (RFC 3533 section 6). */
const PAGE_OVERHEAD = 28;

/** Room for the two header pages, OpusHead and OpusTags. */
const HEADER_ROOM = 8_192;

/** The most a whole sound's Ogg output can be: two minutes of packets, a page each, and the headers. */
const LONGEST_OUTPUT = MOST_OPUS_PACKETS * (OPUS_PACKET_BYTES + PAGE_OVERHEAD) + HEADER_ROOM;

/** How long a whole sound may take to encode: two minutes encodes in well under a second. */
const ENCODE_TIMEOUT_MS = 30_000;

export interface FfmpegOptions {
  /** The ffmpeg program, with libopus; `ffmpeg`, found on the path, when absent. */
  readonly path?: string;
}

/** ffmpeg's arguments: 16-bit mono at `rate` in, read as it comes; Opus in the profile out, a page a packet. */
function ffmpegArguments(rate: SampleRate): string[] {
  // A line each for the input's reading, the input, the encoder and the output, as ffmpeg's own command line is written; Prettier would put an argument a line.
  // prettier-ignore
  return [
    "-v", "error", "-probesize", String(LEAST_PROBE_BYTES), "-analyzeduration", "0",
    "-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0",
    "-ar", String(OPUS_RATE), "-c:a", "libopus", "-b:a", String(OPUS_BITRATE), "-vbr", "off", "-frame_duration", String(OPUS_FRAME_MS),
    "-page_duration", String(OPUS_FRAME_MS * MILLISECOND_US), "-flush_packets", "1", "-f", "ogg", "pipe:1",
  ];
}

/** `packets`, each checked to be the profile's constant-rate length, back to back. */
function joined(packets: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(packets.length * OPUS_PACKET_BYTES);
  packets.forEach((packet, index) => {
    if (packet.length !== OPUS_PACKET_BYTES) {
      throw new RangeError(`ffmpeg wrote a packet of ${packet.length} bytes, not the constant ${OPUS_PACKET_BYTES}`);
    }
    out.set(packet, index * OPUS_PACKET_BYTES);
  });
  return out;
}

function complaint(text: string): string {
  return text.trim().slice(-KEPT_COMPLAINT);
}

function encodeSound(path: string, samples: Int16Array, rate: SampleRate): EncodedOpus {
  // At most two minutes, as the server takes: MOST_SAMPLES at OPUS_RATE.
  if (samples.length === 0 || samples.length * OPUS_RATE > MOST_SAMPLES * rate) {
    throw new RangeError(`opus: a sound of ${samples.length} samples at ${rate} Hz is empty or longer than two minutes`);
  }
  const done = spawnSync(path, ffmpegArguments(rate), { input: pcmBytes(samples), maxBuffer: LONGEST_OUTPUT, timeout: ENCODE_TIMEOUT_MS });
  if (done.error !== undefined || done.status !== 0) {
    throw new Error(`opus: ${path} failed: ${done.error?.message ?? complaint(done.stderr.toString())}`);
  }
  const reader = new OggOpusReader(OPUS_PACKET_BYTES, MOST_OPUS_PACKETS);
  reader.push(done.stdout);
  const packets = joined(reader.take());
  const count = packets.length / OPUS_PACKET_BYTES;
  if (count === 0) {
    throw new RangeError(`opus: ${path} wrote no packets`);
  }
  // The last page's granule is the sound's length, pre-skip and all (RFC 7845 section 4); its packets' frames hold it, the last only partly.
  const samplesHeld = Math.min(count * OPUS_FRAME_SAMPLES, Math.max((count - 1) * OPUS_FRAME_SAMPLES + 1, reader.granule));
  return { packetBytes: OPUS_PACKET_BYTES, samples: samplesHeld, packets };
}

/** A stream encoded by one ffmpeg process, read as it writes. */
class FfmpegStream implements OpusStream {
  readonly packetBytes = OPUS_PACKET_BYTES;
  readonly #child;
  readonly #reader = new OggOpusReader(OPUS_PACKET_BYTES, MOST_OPUS_PACKETS);
  #failure: string | null = null;
  #closed = false;
  #complaint = "";

  constructor(path: string, rate: SampleRate) {
    this.#child = spawn(path, ffmpegArguments(rate), { stdio: ["pipe", "pipe", "pipe"] });
    this.#child.stdout.on("data", (chunk: Buffer) => {
      try {
        this.#reader.push(chunk);
      } catch (error) {
        this.#fail(error instanceof Error ? error.message : String(error));
      }
    });
    this.#child.stderr.on("data", (chunk: Buffer) => {
      this.#complaint = `${this.#complaint}${chunk.toString()}`.slice(-KEPT_COMPLAINT);
    });
    this.#child.on("error", (error) => {
      this.#fail(`${path} did not start: ${error.message}`);
    });
    this.#child.stdin.on("error", (error) => {
      this.#fail(`${path} stopped reading: ${error.message}`);
    });
    this.#child.on("close", (code) => {
      if (code !== 0 && !this.#closed) {
        this.#fail(`${path} failed: ${complaint(this.#complaint) || `exit ${String(code)}`}`);
      }
    });
  }

  get failure(): string | null {
    return this.#failure;
  }

  write(samples: Int16Array): void {
    if (this.#failure === null && !this.#closed && samples.length > 0) {
      this.#child.stdin.write(pcmBytes(samples));
    }
  }

  end(): void {
    if (!this.#closed) {
      this.#child.stdin.end();
    }
  }

  take(): Uint8Array {
    try {
      return joined(this.#reader.take());
    } catch (error) {
      this.#fail(error instanceof Error ? error.message : String(error));
      return new Uint8Array(0);
    }
  }

  close(): void {
    this.#closed = true;
    this.#child.kill();
  }

  #fail(why: string): void {
    this.#failure ??= `opus: ${why}`;
    this.close();
  }
}

/** Opus encoded by ffmpeg with libopus: a whole sound by one run of it, a stream by one process that lives as long as it does. */
export function ffmpegOpus(options: FfmpegOptions = {}): OpusEncoder {
  const path = options.path ?? "ffmpeg";
  return {
    sound: (samples, rate) => encodeSound(path, samples, rate),
    stream: (rate) => new FfmpegStream(path, rate),
  };
}
