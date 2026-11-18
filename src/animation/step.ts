// One step of a timeline being built (animation.md ANIM-19): each call adds
// one operation, in ANIM-21's shape, on an object by its number. Nothing is
// checked: every bound is the schema's and the server's (DEC-6462).

import type { AnimationOp, LookName } from "../wire/generated/protocol.js";

/** One step of a timeline being built: each call adds an operation to it, in the order called, and gives the step back (ANIM-19). */
export interface TimelineStep {
  /** Puts the object at `x`, `y`, or moves it by them with `relative`, in its renderer's units. */
  move(object: number, x: number, y: number, relative?: boolean): TimelineStep;
  show(object: number): TimelineStep;
  hide(object: number): TimelineStep;
  /** Forces a look on the object; `normal` lets the pointer decide again. */
  look(object: number, look: LookName): TimelineStep;
  /** Sets the object's layer, or keeps it with `null`, and its order within the layer. */
  order(object: number, layer: number | null, order: number): TimelineStep;
  /** Shows one frame of the object, and stops any cycle. */
  frame(object: number, frame: number): TimelineStep;
  /** Cycles the object's frames from `first` to `last`, one each `period` ticks, looping or `once`. */
  cycle(object: number, first: number, last: number, period: number, once?: boolean): TimelineStep;
  /** Stops the object's cycle at the frame shown. */
  stopCycle(object: number): TimelineStep;
  /** Puts the object back as its definition has it. */
  reset(object: number): TimelineStep;
}

/** The calls of one step, each adding its operation in ANIM-21's shape. */
export class Step implements TimelineStep {
  readonly #ops: AnimationOp[];

  constructor(ops: AnimationOp[]) {
    this.#ops = ops;
  }

  #add(op: AnimationOp): this {
    this.#ops.push(op);
    return this;
  }

  move(object: number, x: number, y: number, relative = false): this {
    return this.#add({ action: "move", target: { object }, x, y, relative });
  }

  show(object: number): this {
    return this.#add({ action: "show", target: { object } });
  }

  hide(object: number): this {
    return this.#add({ action: "hide", target: { object } });
  }

  look(object: number, look: LookName): this {
    return this.#add({ action: "look", target: { object }, look });
  }

  order(object: number, layer: number | null, order: number): this {
    return this.#add({ action: "order", target: { object }, layer, order });
  }

  frame(object: number, frame: number): this {
    return this.#add({ action: "frame", target: { object }, frame });
  }

  cycle(object: number, first: number, last: number, period: number, once = false): this {
    return this.#add({ action: "cycle", target: { object }, first, last, period, once });
  }

  stopCycle(object: number): this {
    return this.#add({ action: "stop_cycle", target: { object } });
  }

  reset(object: number): this {
    return this.#add({ action: "reset", target: { object } });
  }
}
