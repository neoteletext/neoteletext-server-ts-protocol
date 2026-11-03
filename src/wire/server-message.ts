// The server's messages, each read from its line and checked whole against
// the schema before anything acts on it (validate.ts): a line that is not
// valid is refused, never half-taken.

import type { Input } from "../input/input.ts";
import { readInput } from "../input/read-input.ts";
import { PAGE_RADIX } from "../page/page-numbers.ts";
import { type Language, readLanguages } from "./languages.ts";
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
  /** The request number of the message refused, when it carried one (REQ-2216 item 3). */
  readonly request: number | null;
  readonly path: string;
  readonly rule: string;
  readonly detail: string;
}

/** What one text run cost (REQ-2216 item 2). */
export interface RunCost {
  /** The cells it takes on its row. */
  readonly cells: number;
  /** The triplets it added, its share of row addresses and the Termination Marker included. */
  readonly triplets: number;
  /** 1 when its marks take the row above and the row below it. */
  readonly markRows: 0 | 1;
}

/** The answer to `measure` (REQ-2216): what the page's encoding costs. */
export interface Measured {
  /** The X/26 triplets the page uses, the program's and the encoder's, the Termination Marker included. */
  readonly triplets: number;
  /** The most it may use: 208. */
  readonly limit: number;
  /** The default G0 and G2 designation (EN 300 706 Table 32) and the second G0 designation (Table 33), or null for none. */
  readonly designation: { readonly default: number; readonly second: number | null };
  /** Each text run's cost, in the order of the page's runs. */
  readonly runs: readonly RunCost[];
}

/** A message from the server, checked. */
export type ServerMessage =
  | { readonly type: "start"; readonly protocol: number; readonly epochMs: number; readonly limits: Limits; readonly languages: readonly Language[] }
  | {
      readonly type: "connected";
      readonly connection: number;
      readonly session: number;
      /** The selection's number, which the answer carries back (DEC-1759 lesson 13). */
      readonly request: number;
      readonly cookies: readonly CookiePair[];
      readonly selection: Selection | null;
      /** `selection`'s place, as an address names it (DEC-1730). */
      readonly path: string | null;
      /** The query of `selection`: untrusted text (DEC-1730). */
      readonly query: string | null;
    }
  | {
      readonly type: "selected";
      readonly connection: number;
      /** The selection's number, which the answer carries back (DEC-1759 lesson 13). */
      readonly request: number;
      readonly selection: Selection;
      /** The place selected, as an address names it (DEC-1730). */
      readonly path: string;
      /** The query of the address selected: untrusted text (DEC-1730). */
      readonly query: string | null;
    }
  | { readonly type: "input"; readonly connection: number; readonly page: number; readonly sub: number; readonly input: Input }
  | { readonly type: "left"; readonly connection: number; readonly page: number }
  | { readonly type: "closed"; readonly session: number }
  | { readonly type: "stats"; readonly stats: ServerStats }
  | { readonly type: "refused"; readonly refusal: Refusal }
  | { readonly type: "measured"; readonly request: number; readonly measured: Measured }
  /** A web visitor is at a page's address: the page number and nothing else (REQ-1728). */
  | { readonly type: "describe"; readonly page: number };

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

function connectedOf(message: Extract<WireServerMessage, { type: "connected" }>): ServerMessage {
  const selection = message.selection ?? null;
  return {
    type: "connected",
    connection: message.connection,
    session: message.session,
    request: message.request,
    cookies: message.cookies,
    selection: selection === null ? null : { page: pageOf(selection.page), sub: subOf(selection.sub) },
    path: message.path ?? null,
    query: message.query ?? null,
  };
}

function startOf(message: Extract<WireServerMessage, { type: "start" }>): ServerMessage {
  return {
    type: "start",
    protocol: message.protocol,
    epochMs: message.epoch_ms,
    limits: readLimits(message.standard, message.budgets),
    languages: readLanguages(message.languages),
  };
}

function measuredOf(message: Extract<WireServerMessage, { type: "measured" }>): ServerMessage {
  return {
    type: "measured",
    request: message.request,
    measured: {
      triplets: message.triplets,
      limit: message.limit,
      designation: { default: message.designation.default, second: message.designation.second ?? null },
      runs: message.runs.map(({ cells, triplets, mark_rows: markRows }) => ({ cells, triplets, markRows })),
    },
  };
}

function messageOf(message: WireServerMessage): ServerMessage | string {
  if (message.type === "start") {
    return startOf(message);
  }
  if (message.type === "connected") {
    return connectedOf(message);
  }
  if (message.type === "selected") {
    return {
      type: "selected",
      connection: message.connection,
      request: message.request,
      selection: { page: pageOf(message.page), sub: subOf(message.sub) },
      path: message.path,
      query: message.query ?? null,
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
  if (message.type === "describe") {
    return { type: "describe", page: pageOf(message.page) };
  }
  if (message.type === "measured") {
    return measuredOf(message);
  }
  return {
    type: "refused",
    refusal: { message: message.message ?? null, request: message.request ?? null, path: message.path, rule: message.rule, detail: message.detail },
  };
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
  return messageOf(read);
}
