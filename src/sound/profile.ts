// The engine's audio profile (DOC-1972; the engine's audio.md): what the
// kit's Opus encoder and a program's samples are made to. Every other bound
// of a sound is the schema's (typescript.md TS-36).

/** The profile's sample rates (DOC-1972; the engine's `audio.md`). */
export const SAMPLE_RATES = [8_000, 11_025, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000] as const;

export type SampleRate = (typeof SAMPLE_RATES)[number];

/** The longest sound one message may carry: two minutes at 48 kHz, the browser's limit (DOC-1972). */
export const MOST_SAMPLES = 48_000 * 120;

export const SAMPLE_BYTES = 2;

/** Milliseconds in a second, for the profile's rates. */
const SECOND_MS = 1_000;

/** Bits in a byte. */
const BYTE_BITS = 8;

/** The one rate Opus is carried at (the engine's decision E.123). */
export const OPUS_RATE = 48_000;

/** Each Opus packet holds one frame this long (E.123). */
export const OPUS_FRAME_MS = 20;

/** Samples in each packet's frame, at {@link OPUS_RATE}: 960. */
export const OPUS_FRAME_SAMPLES = (OPUS_RATE * OPUS_FRAME_MS) / SECOND_MS;

/** The profile's average rate (E.123), which the server holds every sound to at constant rate (its decision 21 item 3). */
export const OPUS_BITRATE = 16_000;

/** The packet a constant-rate encoder writes at {@link OPUS_BITRATE}, and the longest the server takes: 40 bytes (DOC-1972). */
export const OPUS_PACKET_BYTES = (OPUS_BITRATE * OPUS_FRAME_MS) / SECOND_MS / BYTE_BITS;

/** The most packets a stored Opus sound has: {@link MOST_SAMPLES}, two minutes, in frames. */
export const MOST_OPUS_PACKETS = MOST_SAMPLES / OPUS_FRAME_SAMPLES;

// The profile's figures are whole: a frame of whole samples, a packet of whole bytes, two minutes of whole frames.
for (const figure of [OPUS_FRAME_SAMPLES, OPUS_PACKET_BYTES, MOST_OPUS_PACKETS]) {
  if (!Number.isInteger(figure)) {
    throw new RangeError(`the Opus profile's figures are whole numbers, not ${figure}`);
  }
}
