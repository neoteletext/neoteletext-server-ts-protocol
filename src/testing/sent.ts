// What the program wrote, as the harness reads it back: each line parsed.

import { PAGE_RADIX } from "../page/page-numbers.ts";
import type { ReadPage } from "../page/content.ts";
import { isFields } from "../wire/fields.ts";

/** A line the program wrote, parsed. */
export type Sent = Readonly<Record<string, unknown>>;

/** A page as the protocol writes it, "1A0", as a number. */
export function pageOf(value: unknown): number | undefined {
  return typeof value === "string" ? Number.parseInt(value, PAGE_RADIX) : undefined;
}

export function last(pages: readonly ReadPage[]): ReadPage {
  const page = pages.at(-1);
  if (page === undefined) {
    throw new Error("a publication with no sub-page");
  }
  return page;
}

/** A line the program wrote, parsed; a line that is not a JSON object fails the test that drew it. */
export function parseSent(line: string): Sent {
  const message: unknown = JSON.parse(line);
  if (!isFields(message)) {
    throw new TypeError(`the program wrote a line that is not a JSON object: ${line}`);
  }
  return message;
}

/** Whether a message's `connections` name `connection`, or are every connection. */
export function isFor(connections: unknown, connection: number): boolean {
  return connections === "all" || (Array.isArray(connections) && connections.includes(connection));
}
