// The server's messages, each read from its line and checked whole against
// the schema before anything acts on it (validate.ts): a line that is not
// valid is refused, never half-taken.

import type { Input } from "../input/input.ts";
import { readInput } from "../input/read-input.ts";
import { PAGE_RADIX } from "../page/page-numbers.ts";
import { type Limits, readLimits } from "./limits.ts";
import type { WireServerMessage } from "./server-wire.ts";
import type { ServerStats } from "./stats.ts";
import { readServer } from "./validate.ts";

/** A page and a sub-code, as numbers: the sub-code 0x3F7F is the page and none of its sub-pages. */
export interface Selection {
  readonly page: number;
  readonly sub: number;
}

/** A cookie as the viewer's request carried it. */
export interface CookiePair {
  readonly name: string;
  readonly value: string;
}

/** A refusal: a line the program sent that the server did nothing of. */
export interface Refusal {
  readonly message: string | null;
  readonly path: string;
  readonly rule: string;
  readonly detail: string;
}

/** A message from the server, checked. */
export type ServerMessage =
  | { readonly type: "start"; readonly protocol: number; readonly epochMs: number; readonly limits: Limits }
  | {
      readonly type: "connected";
      readonly connection: number;
      readonly session: number;
      readonly cookies: readonly CookiePair[];
      readonly selection: Selection | null;
      /** The query of the address the viewer opened: untrusted text (REQ-1674). */
      readonly query: string | null;
      /** The page parameters of `selection`: untrusted text (REQ-1693 item 6). */
      readonly parameters: string | null;
    }
  | { readonly type: "selected"; readonly connection: number; readonly selection: Selection; readonly parameters: string | null }
  | { readonly type: "input"; readonly connection: number; readonly page: number; readonly sub: number; readonly input: Input }
  | { readonly type: "left"; readonly connection: number; readonly page: number }
  | { readonly type: "closed"; readonly session: number }
  | { readonly type: "stats"; readonly stats: ServerStats }
  | { readonly type: "refused"; readonly refusal: Refusal };

/** Whether `value` is a session as the protocol writes it: a whole number below 2^53. */
export function isSession(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

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

/** A sub-code the schema has checked, as a number. */
function subOf(text: string): number {
  return Number.parseInt(text, PAGE_RADIX);
}

/** A page number the schema has checked, as a number. */
function pageOf(text: string): number {
  return Number.parseInt(text, PAGE_RADIX);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The server's figures: each an object, as the schema leaves them. */
function statsOf(server: unknown, channel: unknown): ServerStats | string {
  return isObject(server) && isObject(channel) ? { server, channel } : "stats: server and channel are objects";
}

function messageOf(message: WireServerMessage): ServerMessage | string {
  if (message.type === "start") {
    return { type: "start", protocol: message.protocol, epochMs: message.epoch_ms, limits: readLimits(message.standard, message.budgets) };
  }
  if (message.type === "connected") {
    const selection = message.selection ?? null;
    return {
      type: "connected",
      connection: message.connection,
      session: message.session,
      cookies: message.cookies,
      selection: selection === null ? null : { page: pageOf(selection.page), sub: subOf(selection.sub) },
      query: message.query ?? null,
      parameters: message.parameters ?? null,
    };
  }
  if (message.type === "selected") {
    return {
      type: "selected",
      connection: message.connection,
      selection: { page: pageOf(message.page), sub: subOf(message.sub) },
      parameters: message.parameters ?? null,
    };
  }
  if (message.type === "input") {
    return {
      type: "input",
      connection: message.connection,
      page: pageOf(message.page),
      sub: subOf(message.sub),
      input: readInput(message.event, message.lost),
    };
  }
  if (message.type === "left") {
    return { type: "left", connection: message.connection, page: pageOf(message.page) };
  }
  if (message.type === "closed") {
    return { type: "closed", session: message.session };
  }
  if (message.type === "stats") {
    const stats = statsOf(message.server, message.channel);
    return typeof stats === "string" ? stats : { type: "stats", stats };
  }
  return { type: "refused", refusal: { message: message.message ?? null, path: message.path, rule: message.rule, detail: message.detail } };
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
  if ("rule" in read) {
    return `${read.path === "" ? "the message" : read.path}: ${read.rule} (${read.detail})`;
  }
  return messageOf(read);
}
