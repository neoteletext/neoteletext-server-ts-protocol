// What encodes a program's sound as Opus in the engine's profile (the
// engine's decision E.123; docs/applications.md section 3.4): a whole
// sound at once, or a stream as its samples come. The server carries the
// packets and encodes nothing (its decision 21).

import type { SampleRate } from "./profile.ts";

/** A sound encoded: constant-rate packets back to back, and its length at OPUS_RATE, the encoder's pre-skip with it. */
export interface EncodedOpus {
  readonly packetBytes: number;
  readonly samples: number;
  readonly packets: Uint8Array;
}

/** A stream being encoded as its samples come. */
export interface OpusStream {
  /** Every packet's length. */
  readonly packetBytes: number;
  /** Why it cannot encode, once it cannot; it then takes nothing more. */
  readonly failure: string | null;
  /** The stream's next samples, 16-bit mono at its rate. */
  write(samples: Int16Array): void;
  /** No more samples: what the encoder holds comes out. */
  end(): void;
  /** The packets encoded since the last take, back to back; the encoder may give them out later than it is written to. */
  take(): Uint8Array;
  /** Stops the encoder, dropping what it holds. */
  close(): void;
}

/** What encodes a program's sounds. */
export interface OpusEncoder {
  /** A whole sound, 16-bit mono at `rate`, encoded now. */
  sound(samples: Int16Array, rate: SampleRate): EncodedOpus;
  /** A stream at `rate`, encoded as it is written. */
  stream(rate: SampleRate): OpusStream;
}
