// The program's side of the protocol, version 13 (DEC-1482): each message
// it writes is the generated type of its message (typescript.md TS-8),
// written with its bytes fields as base64 (TS-21) and checked first against
// the server's schema by the precompiled validators (validate.ts, TS-16), so
// a mistake is caught where it is made and nothing that is not valid is ever
// written. The bounds the schema does not hold are the server's, given in
// `start` (limits.ts).

import { encodeBytes } from "./bytes.ts";
import type { ProgramMessage } from "./generated/protocol.js";
import type { Language } from "./languages.ts";
import type { Limits } from "./limits.ts";
import { ProtocolError, checkProgram } from "./validate.ts";

/** The program's side of the protocol: each call writes one line, checked first. */
export class App {
  readonly #write: (line: string) => void;
  #limits: Limits | undefined;
  #languages: readonly Language[] = [];

  /** A program that writes its lines, each without its newline, to `write`. */
  constructor(write: (line: string) => void) {
    this.#write = write;
  }

  /** The server said `start`, with the limits it keeps to and the languages it writes. */
  started(limits: Limits, languages: readonly Language[]): void {
    this.#limits = limits;
    this.#languages = languages;
  }

  /** The languages a page or run of text may name, as `start` listed them; none before it. */
  languages(): readonly Language[] {
    return this.#languages;
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

  /** The line `message` is, if it is valid within the limits `start` gave; otherwise a {@link ProtocolError} naming its first fault is thrown. Nothing is made before `start`. */
  line(message: ProgramMessage): string {
    const limits = this.limits();
    const encoded = encodeBytes(message, "ProgramMessage");
    const fault = checkProgram(encoded, limits);
    if (fault !== null) {
      throw new ProtocolError(message.type, fault);
    }
    const line = JSON.stringify(encoded);
    const most = limits.budgets.lineBytes;
    if (Buffer.byteLength(line) > most) {
      throw new ProtocolError(message.type, { path: "", rule: "line_too_long", detail: `${Buffer.byteLength(line)} bytes, at most ${most}` });
    }
    return line;
  }

  /** Writes lines already made by {@link App.line}, in order. */
  writeLines(lines: readonly string[]): void {
    for (const line of lines) {
      this.#write(line);
    }
  }

  /** Writes `message` if it is valid within the limits `start` gave; otherwise writes nothing and throws a {@link ProtocolError} naming its first fault. Nothing is sent before `start`. */
  send(message: ProgramMessage): void {
    this.#write(this.line(message));
  }
}
