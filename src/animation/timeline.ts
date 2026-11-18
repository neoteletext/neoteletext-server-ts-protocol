// A timeline of animation: steps of operations, each at a tick, which the
// server plays on its own clock (animation.md ANIM-19, ANIM-21; DEC-6462).
// The builder only gathers the steps of the `timeline` message: it holds no
// clock and checks nothing, and every bound is the schema's and the
// server's. For animation that must answer the viewer at once, a page's
// rules do it in the viewer's receiver (page-rules.md).

import { Step, type TimelineStep } from "./step.ts";
import type { AnimationOp, TimelineStep as WireStep } from "../wire/generated/protocol.js";

/** A step as it was made: its tick and the operations added to it so far. */
interface Made {
  readonly tick: number;
  readonly ops: AnimationOp[];
}

/** A timeline being built (ANIM-19): send it with `context.playTimeline`. */
export class Timeline {
  /** The ticks after which the server plays the timeline again from its start, or null for once: the message's `loop_ticks`. */
  readonly loopTicks: number | null;
  readonly #made: Made[] = [];
  /** The tick of the step made last, which `then` counts from: 0 before any. */
  #last = 0;

  constructor(options: { readonly loopTicks?: number } = {}) {
    this.loopTicks = options.loopTicks ?? null;
  }

  /** A step at tick `tick`, counted from the timeline's start. */
  at(tick: number): TimelineStep {
    const made: Made = { tick, ops: [] };
    this.#made.push(made);
    this.#last = tick;
    return new Step(made.ops);
  }

  /**
   * A step `ticks` ticks after the step made last, or after the start when
   * it is the first. The call's name is ANIM-19's, and it is also the name
   * by which JavaScript takes an object for a promise: a timeline awaited,
   * or returned from an async function, has its `then` called with two
   * functions and would never settle. That mistake is refused here, with a
   * TypeError the await rejects with, so that it is seen where it is made.
   */
  // oxlint-disable-next-line unicorn/no-thenable -- animation.md ANIM-19 names the builder's call `then`; a call that is the promise machinery's is refused below
  then(ticks: number): TimelineStep {
    if (typeof ticks !== "number") {
      throw new TypeError(
        "a Timeline is not a promise: do not await it or return it from an async function; its then(ticks) begins a step (animation.md ANIM-19)",
      );
    }
    return this.at(this.#last + ticks);
  }

  /**
   * The message's `steps`: in ascending tick, the steps of one tick joined
   * into one in the order they were made, and a step given no operation
   * left out, since it says nothing (a `then` used only to wait).
   */
  get steps(): readonly WireStep[] {
    const joined = new Map<number, AnimationOp[]>();
    for (const { tick, ops } of this.#made) {
      const before = joined.get(tick);
      if (before === undefined) {
        joined.set(tick, [...ops]);
      } else {
        before.push(...ops);
      }
    }
    return [...joined]
      .filter(([, ops]) => ops.length > 0)
      .toSorted(([one], [two]) => one - two)
      .map(([tick, ops]) => ({ tick, ops }));
  }
}
