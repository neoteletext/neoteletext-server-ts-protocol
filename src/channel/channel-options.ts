// What a channel is made with.

/** The channel's clock: milliseconds since the program started, never going back. */
export interface Clock {
  now(): number;
}

export interface ChannelOptions {
  readonly clock: Clock;
  readonly seed: bigint;
  /** Where a failing application is reported: standard error. */
  readonly errors: (text: string) => void;
}
