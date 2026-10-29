// The protocol's own bounds, and the figures the server tells a program in
// `start` (docs/applications.md section 2): the standard's maxima, from the
// engine's limits, and the server's budgets. The kit writes none of those
// figures: a program that needs one asks the context for it.

import { isFields } from "./fields.ts";

/** The protocol's version, in `start` (docs/applications.md). */
export const PROTOCOL = 1;

/**
 * The longest line either side may send (docs/applications.md section 1):
 * 16 MiB. The protocol's framing, which bounds the reading of `start`
 * itself, so it is known before `start` comes.
 */
export const LONGEST_LINE = 16 * 1024 * 1024;

/** The standard's maxima, as `start` gives them. */
export interface Standard {
  /** Magazines, 1 to 8. */
  readonly magazines: number;
  /** Page numbers that may carry a page. */
  readonly pages: number;
  /** Of those, the ones a viewer can key. */
  readonly keyablePages: number;
  /** Sub-pages a page may hold, put by their sub-codes. */
  readonly subpages: number;
  /** Sub-pages a whole page may have, numbered by place by the server. */
  readonly numberedSubpages: number;
  /** Sub-codes a viewer can key. */
  readonly decimalSubpages: number;
}

/** The server's own bounds on what a program sends, as `start` gives them. */
export interface Budgets {
  /** The longest line, in bytes. */
  readonly lineBytes: number;
  /** The longest page title or section name, in characters. */
  readonly titleCharacters: number;
}

/** What `start` tells a program of the limits it works within. */
export interface Limits {
  readonly standard: Standard;
  readonly budgets: Budgets;
}

/** A count as the protocol writes it: a whole number, at least 1. */
function count(fields: Readonly<Record<string, unknown>>, name: string): number | undefined {
  const value = fields[name];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** `start`'s `standard` and `budgets`, checked whole; undefined when either is missing or has a field that is not a count. */
export function readLimits(standard: unknown, budgets: unknown): Limits | undefined {
  if (!isFields(standard) || !isFields(budgets)) {
    return undefined;
  }
  const read = {
    magazines: count(standard, "magazines"),
    pages: count(standard, "pages"),
    keyablePages: count(standard, "keyable_pages"),
    subpages: count(standard, "subpages"),
    numberedSubpages: count(standard, "numbered_subpages"),
    decimalSubpages: count(standard, "decimal_subpages"),
    lineBytes: count(budgets, "line_bytes"),
    titleCharacters: count(budgets, "title_characters"),
  };
  const { magazines, pages, keyablePages, subpages, numberedSubpages, decimalSubpages, lineBytes, titleCharacters } = read;
  if (
    magazines === undefined ||
    pages === undefined ||
    keyablePages === undefined ||
    subpages === undefined ||
    numberedSubpages === undefined ||
    decimalSubpages === undefined ||
    lineBytes === undefined ||
    titleCharacters === undefined
  ) {
    return undefined;
  }
  return { standard: { magazines, pages, keyablePages, subpages, numberedSubpages, decimalSubpages }, budgets: { lineBytes, titleCharacters } };
}
