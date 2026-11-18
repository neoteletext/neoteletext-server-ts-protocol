// The one viewer object of each handle the program has been given, so that a
// viewer compares by value with `===` (viewer-state.md VS-401).

import { Viewer } from "./viewer.ts";
import type { Handle } from "../wire/generated/protocol.js";

/** The one object of each handle the program has been given. */
export class Viewers {
  readonly #of = new Map<Handle, Viewer>();

  /** The viewer of `handle`, the same object each time. */
  of(handle: Handle): Viewer {
    const known = this.#of.get(handle);
    if (known !== undefined) {
      return known;
    }
    const viewer = new Viewer(handle);
    this.#of.set(handle, viewer);
    return viewer;
  }

  /** Every handle is void (VS-306): none is kept. */
  clear(): void {
    this.#of.clear();
  }
}
