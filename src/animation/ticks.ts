// The presentation clock every rule and animation runs on (animation.md
// ANIM-1; page-rules.md RULE-4): sixty ticks a second, on which the server
// plays a timeline's steps (ANIM-21) and a receiver evaluates a page's
// rules. Its rate is the engine's TICKS_PER_SECOND (rules/limits.ts).

import { TICKS_PER_SECOND } from "../rules/limits.ts";

/** Milliseconds in a second. */
const MS_PER_SECOND = 1000;

/** The whole ticks that have passed `ms` milliseconds after tick 0. */
export function ticksIn(ms: number): number {
  return Math.floor((ms * TICKS_PER_SECOND) / MS_PER_SECOND);
}
