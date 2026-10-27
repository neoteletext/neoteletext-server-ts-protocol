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
