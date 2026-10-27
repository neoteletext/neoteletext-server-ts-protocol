// What the program wrote, as the harness reads it back: each line parsed,
// and the publications, releases and pages in it.

import { PAGE_RADIX } from "../page/page-numbers.ts";
import type { ReadPage } from "../tti/read-tti.ts";
import { isFields } from "../wire/fields.ts";

/** A line the program wrote, parsed. */
export type Sent = Readonly<Record<string, unknown>>;

/** A page as the protocol writes it, "1A0", as a number. */
export function pageOf(value: unknown): number | undefined {
  return typeof value === "string" ? Number.parseInt(value, PAGE_RADIX) : undefined;
}

export function isPublication(message: Sent, page: number, owner: "channel" | number): boolean {
  return message["type"] === "publish" && pageOf(message["page"]) === page && message["owner"] === owner;
}

export function isRelease(message: Sent, page: number, session: number): boolean {
  return message["type"] === "release" && pageOf(message["page"]) === page && message["session"] === session;
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

/** The title a `pages` line declared `page` with, if it declared it. */
export function declaredTitle(pages: readonly unknown[], page: number): string | undefined {
  const declared = pages.filter((entry) => isFields(entry)).find((entry) => pageOf(entry["page"]) === page);
  return declared === undefined ? undefined : String(declared["title"]);
}

/** Whether a sound's `to` is `session`. */
export function isFor(to: unknown, session: number): boolean {
  return isFields(to) && to["session"] === session;
}
