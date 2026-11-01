// A clock a test moves.

import type { Clock } from "../channel/channel-options.ts";

export class ManualClock implements Clock {
  time = 0;

  now(): number {
    return this.time;
  }
}
