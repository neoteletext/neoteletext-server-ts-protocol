// The program's side of the protocol, version 5 (DEC-1482): each message
// it writes is checked first against the server's schema by the
// precompiled validators (validate.ts), so a mistake is caught where it is
// made and nothing that is not valid is ever written. The bounds the
// schema does not hold are the server's, given in `start` (limits.ts).

import type { Limits } from "./limits.ts";
import type { ProgramMessage } from "./protocol.ts";
import { ProtocolError, checkProgram } from "./validate.ts";

/** The program's side of the protocol: each call writes one line, checked first. */
export class App {
  readonly #write: (line: string) => void;
  #limits: Limits | undefined;

  /** A program that writes its lines, each without its newline, to `write`. */
  constructor(write: (line: string) => void) {
    this.#write = write;
  }

  /** The server said `start`, with the limits it keeps to. */
  started(limits: Limits): void {
    this.#limits = limits;
  }

  /** Whether `start` has come. */
  hasStarted(): boolean {
    return this.#limits !== undefined;
  }

  /** The limits `start` gave; a program sends nothing before it, so asking before is a mistake. */
  limits(): Limits {
    if (this.#limits === undefined) {
      throw new Error("the limits are the server's, given in start: nothing is sent before it");
    }
    return this.#limits;
  }

  /** Writes `message` if it is valid; otherwise writes nothing and throws a {@link ProtocolError} naming its first fault. */
  send(message: ProgramMessage): void {
    const fault = checkProgram(message);
    if (fault !== null) {
      throw new ProtocolError(message.type, fault);
    }
    const line = JSON.stringify(message);
    const most = this.#limits?.budgets.lineBytes;
    if (most !== undefined && Buffer.byteLength(line) > most) {
      throw new ProtocolError(message.type, { path: "", rule: "line_too_long", detail: `${Buffer.byteLength(line)} bytes, at most ${most}` });
    }
    this.#write(line);
  }
}
