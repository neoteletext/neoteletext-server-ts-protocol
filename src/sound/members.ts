// What a `sound` message carries: a stored sound, a live one and its
// blocks, or a command to a channel. Opus is what desktop and phone
// receivers play; PCM, which the server encodes as IMA ADPCM, is for
// microcontrollers (docs/applications.md section 3.4, decision 21).

import type { SampleRate } from "./profile.ts";

/** Who hears a sound: one viewer, or everyone with a page open. */
export type Audience = { readonly session: number } | { readonly page: number };

/** A stored sound: its samples, sent once and played by later commands. */
export interface SoundObject {
  readonly handle: number;
  readonly generation: number;
  readonly rate: SampleRate;
  readonly samples: Int16Array;
}

/** A live sound's object, whose samples follow as blocks (audio.md section 8.3). */
export interface LiveSound {
  readonly handle: number;
  readonly generation: number;
  readonly rate: SampleRate;
}

/** Live blocks from block number `first`, of 1,017 samples each. */
export interface LiveBlocks extends LiveSound {
  readonly first: number;
  readonly samples: Int16Array;
}

/** A stored Opus sound: constant-rate packets, one 20 ms frame each, back to back, sent once and played by later commands. */
export interface OpusSound {
  readonly handle: number;
  readonly generation: number;
  /** Every packet's length, 1 to OPUS_PACKET_BYTES. */
  readonly packetBytes: number;
  /** The sound's length at OPUS_RATE, the encoder's pre-skip with it: its last packet's frame may run past it. */
  readonly samples: number;
  readonly packets: Uint8Array;
}

/** A live Opus sound's object, whose packets follow. */
export interface OpusLive {
  readonly handle: number;
  readonly generation: number;
  readonly packetBytes: number;
}

/** A live Opus sound's next packets, one a block, from block number `first`. */
export interface OpusPackets extends OpusLive {
  readonly first: number;
  readonly packets: Uint8Array;
}

/** A command to play a stored or live sound on a channel. */
export interface Play {
  readonly channel: number;
  readonly handle: number;
  readonly generation: number;
  /** 0 to 100; 100 when absent. */
  readonly gain?: number;
  readonly fadeMs?: number;
  readonly loop?: boolean;
  /** Start after the sound playing on the channel ends. */
  readonly after?: boolean;
  /** How far other channels duck, 0 to 6. */
  readonly duck?: number;
  /** The page the sound belongs to, or none for the whole service. */
  readonly page?: number;
}

/** A command to stop a channel. */
export interface Stop {
  readonly channel: number;
  readonly fadeMs?: number;
}

/** A command to change a channel's gain. */
export interface Gain {
  readonly channel: number;
  readonly gain: number;
  readonly fadeMs?: number;
}

/** One `sound` message's member. */
export type SoundMember =
  | { readonly object: SoundObject }
  | { readonly live: LiveSound }
  | { readonly blocks: LiveBlocks }
  | { readonly opus: OpusSound }
  | { readonly opusLive: OpusLive }
  | { readonly opusPackets: OpusPackets }
  | { readonly play: Play }
  | { readonly stop: Stop }
  | { readonly gain: Gain };
