// The server's figures, sent every 10 seconds (docs/applications.md section 7).

import { type Fields, isFields } from "./fields.ts";

/** One object of the server's figures: each name a whole number, or an object of them, such as `most_opened`. */
export type Figures = Fields;

/** The server's figures, sent every 10 seconds (docs/applications.md section 7): its own, and this channel's. */
export interface ServerStats {
  readonly server: Figures;
  readonly channel: Figures;
}

/** The figure `name` of `figures`: a whole number, or 0 where it is missing or is not one. */
export function figure(figures: Figures, name: string): number {
  const value = figures[name];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

/** Names in code unit order, not the locale's: the same on every host. */
function compareNames(one: string, two: string): number {
  if (one === two) {
    return 0;
  }
  return one < two ? -1 : 1;
}

/**
 * The figures of the object `name` of `figures`, such as `most_opened`'s
 * pages or `viewers`' channels, the largest first and equal ones by name,
 * as the server ranks the pages: a parsed object puts names that look
 * like whole numbers ("110") first, so the order it was written in is lost.
 */
export function figuresIn(figures: Figures, name: string): [string, number][] {
  const value = figures[name];
  if (!isFields(value)) {
    return [];
  }
  return Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isSafeInteger(entry[1]))
    .toSorted(([oneName, one], [twoName, two]) => two - one || compareNames(oneName, twoName));
}
