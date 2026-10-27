// What a `sound` message carries: a stored sound, a live one and its
// blocks, or a command to a channel.

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
  | { readonly play: Play }
  | { readonly stop: Stop }
  | { readonly gain: Gain };
