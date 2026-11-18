// The server's messages, each read from its line and checked whole against
// the schema before anything acts on it (validate.ts): a line that is not
// valid is refused, never half-taken. Each is the generated type of its
// message (typescript.md TS-8, TS-18).

import { PAGE_RADIX } from "../page/page-numbers.ts";
import type { ServerMessage, Stats } from "./generated/protocol.js";
import { readServer } from "./validate.ts";

/** A page and a sub-code, as numbers: the sub-code 0x3F7F is the page and none of its sub-pages. */
export interface Selection {
  readonly page: number;
  readonly sub: number;
}

/** The server's figures, as `stats` carries them (DOC-1968): its own, and this channel's. */
export type ServerStats = Omit<Stats, "type">;

/** Whether `value` is a connection as the protocol writes it: a whole number from 1, below 2^53. */
export function isConnection(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** A page as the protocol writes it, "100" to "8FF", as a number; undefined for anything else. */
export function readPage(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^[1-8][0-9A-F]{2}$/u.test(value)) {
    return undefined;
  }
  return Number.parseInt(value, PAGE_RADIX);
}

/** A page number or a sub-code the schema has checked, as a number. */
export function numberOf(text: string): number {
  return Number.parseInt(text, PAGE_RADIX);
}

/** One line from the server as a message, checked whole; or why it is refused. */
export function readMessage(line: string): ServerMessage | string {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    return `not JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  const read = readServer(value);
  // A fault has no type; `refused`, a message, has a rule of its own.
  if (!("type" in read)) {
    return `${read.path === "" ? "the message" : read.path}: ${read.rule} (${read.detail})`;
  }
  return read;
}
