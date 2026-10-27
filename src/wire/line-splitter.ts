// Bytes from the server split into lines, each bounded and decoded whole.

import { LONGEST_LINE } from "./limits.ts";

const NEWLINE = 0x0a;

/** The return a line may end with before its newline. */
const RETURN = "\r";

/**
 * Splits bytes into lines of at most {@link LONGEST_LINE} bytes, each
 * without its newline (or a return before it), decoded as UTF-8. A longer
 * line, or one that is not UTF-8, is reported and dropped whole.
 */
export class LineSplitter {
  readonly #onLine: (line: string) => void;
  readonly #onFault: (why: string) => void;
  readonly #decoder = new TextDecoder("utf-8", { fatal: true });
  #pieces: Buffer[] = [];
  #length = 0;
  #skipping = false;

  constructor(onLine: (line: string) => void, onFault: (why: string) => void) {
    this.#onLine = onLine;
    this.#onFault = onFault;
  }

  push(chunk: Buffer): void {
    let rest = chunk;
    for (let end = rest.indexOf(NEWLINE); end >= 0; end = rest.indexOf(NEWLINE)) {
      this.#take(rest.subarray(0, end));
      this.#finish();
      rest = rest.subarray(end + 1);
    }
    this.#take(rest);
  }

  /** The input ended: a last line without its newline counts. */
  end(): void {
    if (this.#length > 0 || this.#skipping) {
      this.#finish();
    }
  }

  #take(bytes: Buffer): void {
    if (this.#skipping || bytes.length === 0) {
      return;
    }
    if (this.#length + bytes.length > LONGEST_LINE) {
      this.#skipping = true;
      this.#pieces = [];
      this.#length = 0;
      return;
    }
    this.#pieces.push(bytes);
    this.#length += bytes.length;
  }

  #finish(): void {
    if (this.#skipping) {
      this.#skipping = false;
      this.#onFault(`a line over ${LONGEST_LINE} bytes, dropped`);
      return;
    }
    const bytes = Buffer.concat(this.#pieces, this.#length);
    this.#pieces = [];
    this.#length = 0;
    let line: string;
    try {
      line = this.#decoder.decode(bytes);
    } catch {
      this.#onFault("a line that is not UTF-8, dropped");
      return;
    }
    if (line.endsWith(RETURN)) {
      line = line.slice(0, -RETURN.length);
    }
    if (line.length > 0) {
      this.#onLine(line);
    }
  }
}
