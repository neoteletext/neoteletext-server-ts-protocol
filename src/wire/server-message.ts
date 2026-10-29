// The server's messages, each read from its line and checked whole before
// anything acts on it: a line that is not valid is refused, never half-taken.

import type { Input } from "../input/input.ts";
import { readInput } from "../input/read-input.ts";
import { isFields } from "./fields.ts";
import { type Limits, readLimits } from "./limits.ts";
import type { ServerStats } from "./stats.ts";

/** A message from the server, checked. */
export type ServerMessage =
  | { readonly type: "start"; readonly protocol: number; readonly epochMs: number; readonly limits: Limits }
  | { readonly type: "join"; readonly session: number }
  | { readonly type: "open"; readonly session: number; readonly page: number }
  | { readonly type: "leave"; readonly session: number; readonly page: number }
  | { readonly type: "input"; readonly session: number; readonly page: number; readonly input: Input }
  | { readonly type: "close"; readonly session: number }
  | { readonly type: "stats"; readonly stats: ServerStats };

/** Whether `value` is a session as the protocol writes it: a whole number. */
export function isSession(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A page as the protocol writes it, "100" to "8FF", as a number; undefined for anything else. */
export function readPage(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^[1-8][0-9A-F]{2}$/u.test(value)) {
    return undefined;
  }
  return Number.parseInt(value, 16);
}

/** One line from the server as a message, checked whole; or why it is refused. */
export function readMessage(line: string): ServerMessage | string {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    return `not JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!isFields(value)) {
    return "not an object";
  }
  const fields = value;
  const type = fields["type"];
  if (type === "start") {
    const protocol = fields["protocol"];
    const epochMs = fields["epoch_ms"];
    if (typeof protocol !== "number" || !Number.isSafeInteger(epochMs) || typeof epochMs !== "number") {
      return "start: protocol and epoch_ms are whole numbers";
    }
    const limits = readLimits(fields["standard"], fields["budgets"]);
    if (limits === undefined) {
      return "start: standard and budgets are objects of counts";
    }
    return { type, protocol, epochMs, limits };
  }
  if (type === "stats") {
    const server = fields["server"];
    const channel = fields["channel"];
    return isFields(server) && isFields(channel) ? { type, stats: { server, channel } } : "stats: server and channel are objects";
  }
  if (type !== "join" && type !== "close" && type !== "open" && type !== "leave" && type !== "input") {
    return `unknown type ${JSON.stringify(type) ?? "undefined"}`;
  }
  const session = fields["session"];
  if (!isSession(session)) {
    return `${type}: a session is a whole number`;
  }
  if (type === "join" || type === "close") {
    return { type, session };
  }
  const page = readPage(fields["page"]);
  if (page === undefined) {
    return `${type}: a page is "100" to "8FF"`;
  }
  if (type === "open" || type === "leave") {
    return { type, session, page };
  }
  const input = readInput(fields["event"]);
  return typeof input === "string" ? input : { type, session, page, input };
}
