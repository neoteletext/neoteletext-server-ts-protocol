// The engine's audio profile (docs/applications.md section 3.4; the
// engine's audio.md): its rates, channels and bounds.

/** The profile's sample rates (docs/applications.md section 3.4; the engine's `audio.md`). */
export const SAMPLE_RATES = [8_000, 11_025, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000] as const;

export type SampleRate = (typeof SAMPLE_RATES)[number];

/** The profile's channels: 0 to 3 (audio.md section 4.4). */
export const AUDIO_CHANNELS = 4;

/** The highest handle: one byte (audio.md section 4.2). */
export const LAST_HANDLE = 255;

/** The highest generation: two bytes. */
export const LAST_GENERATION = 0xffff;

/** Full gain (audio.md section 4.4: 0 to 100). */
export const FULL_GAIN = 100;

/** The longest fade: two bytes of milliseconds. */
export const LONGEST_FADE_MS = 0xffff;

/** The deepest duck step (audio.md section 4.4: 0 to 6). */
export const DEEPEST_DUCK = 6;

/** The longest sound one message may carry: two minutes at 48 kHz, the browser's limit (docs/applications.md section 3.4). */
export const MOST_SAMPLES = 48_000 * 120;

/** The highest block number of a live sound: two bytes. */
export const LAST_BLOCK = 0xffff;

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

/** The packet a constant-rate encoder writes at {@link OPUS_BITRATE}, and the longest the server takes: 40 bytes (docs/applications.md section 3.4). */
export const OPUS_PACKET_BYTES = (OPUS_BITRATE * OPUS_FRAME_MS) / SECOND_MS / BYTE_BITS;

/** The most packets a stored Opus sound has: {@link MOST_SAMPLES}, two minutes, in frames. */
export const MOST_OPUS_PACKETS = MOST_SAMPLES / OPUS_FRAME_SAMPLES;

// The profile's figures are whole: a frame of whole samples, a packet of whole bytes, two minutes of whole frames.
for (const figure of [OPUS_FRAME_SAMPLES, OPUS_PACKET_BYTES, MOST_OPUS_PACKETS]) {
  if (!Number.isInteger(figure)) {
    throw new RangeError(`the Opus profile's figures are whole numbers, not ${figure}`);
  }
}
