// The harness's fake viewers (viewer-state.md VS-404): named viewers with
// fixed handles, so that a test can say "alice in two tabs", "after a reset"
// and "a private window". A handle is 32 lower-case hexadecimal digits
// (VS-305), here the first 32 of the SHA-256 of what names it.

import { createHash } from "node:crypto";

/** A handle's length in hexadecimal digits (VS-305; the schema's Handle). */
const HANDLE_DIGITS = 32;

/** A viewer a test names. */
export interface FakeViewer {
  readonly name: string;
  /** Its handle now: a reset gives it another. */
  readonly handle: string;
  /** Whether it chose to be remembered. */
  readonly remembered: boolean;
}

/** One fake viewer, as the harness keeps it. */
interface Kept {
  readonly name: string;
  handle: string;
  remembered: boolean;
  /** How many times it reset its state. */
  resets: number;
  readonly window: "normal" | "private";
}

function handleOf(kept: Kept): string {
  return createHash("sha256").update(`${kept.window} ${kept.name} ${kept.resets}`).digest("hex").slice(0, HANDLE_DIGITS);
}

/** Every fake viewer a test has named. */
export class FakeViewers {
  readonly #named = new Map<string, Kept>();
  readonly #private = new Map<string, Kept>();
  /** Each viewer given out, which is its kept record, read only. */
  readonly #given = new Map<FakeViewer, Kept>();

  #of(names: Map<string, Kept>, name: string, window: Kept["window"]): FakeViewer {
    const known = names.get(name);
    if (known !== undefined) {
      return known;
    }
    const kept: Kept = { name, handle: "", remembered: false, resets: 0, window };
    kept.handle = handleOf(kept);
    names.set(name, kept);
    this.#given.set(kept, kept);
    return kept;
  }

  named(name: string): FakeViewer {
    return this.#of(this.#named, name, "normal");
  }

  private(name: string): FakeViewer {
    return this.#of(this.#private, name, "private");
  }

  #kept(viewer: FakeViewer): Kept {
    const kept = this.#given.get(viewer);
    if (kept === undefined) {
      throw new Error(`no fake viewer ${viewer.name}: ask the harness for one`);
    }
    return kept;
  }

  remember(viewer: FakeViewer, remembered: boolean): void {
    this.#kept(viewer).remembered = remembered;
  }

  /** The viewer reset its state: a new handle from now on. */
  forget(viewer: FakeViewer): void {
    const kept = this.#kept(viewer);
    kept.resets += 1;
    kept.handle = handleOf(kept);
    kept.remembered = false;
  }
}
