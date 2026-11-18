// A viewer's handle on the channel (viewer-state.md VS-305, VS-401): opaque to
// a program, compared by value and printed as a placeholder, so that a log
// line or a page never shows it. One object stands for each handle, so that
// two connections of one viewer give the same object and `===` compares
// them by value.

import type { Handle } from "../wire/generated/protocol.js";

/** What a viewer prints as, wherever it is printed. */
const PLACEHOLDER = "[viewer]";

/** A viewer on this channel, by the server's handle. */
export class Viewer {
  /** The handle, for a store keyed by viewer (VS-405): never to be shown or sent elsewhere (VS-409). */
  readonly handle: Handle;

  /** One viewer for `handle`: made only by the channel's viewers (viewers.ts). */
  constructor(handle: Handle) {
    this.handle = handle;
  }

  toString(): string {
    return PLACEHOLDER;
  }

  toJSON(): string {
    return PLACEHOLDER;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return PLACEHOLDER;
  }
}
