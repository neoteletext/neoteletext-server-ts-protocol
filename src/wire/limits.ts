// The protocol's version, and the figures the server tells a program in
// `start` (docs/applications.md section 2): the standard's maxima, from the
// engine's limits, and the server's budgets. The kit writes none of those
// figures: a program that needs one asks the context for it.

import type { WireBudgets, WireStandard } from "./server-wire.ts";

/** The protocol's version, in `start` (DEC-1482). */
export const PROTOCOL = 4;

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
  /** Pages a magazine may have. */
  readonly pagesPerMagazine: number;
  /** Pages magazine 1 may have. */
  readonly pagesInMagazine1: number;
  /** Of those, the ones a viewer can key. */
  readonly keyablePages: number;
  /** Sub-pages a page may hold, 0001 to 3F7E. */
  readonly subpages: number;
  /** Sub-codes a viewer can key: those whose digits are all decimal. */
  readonly decimalSubpages: number;
}

/** The server's own bounds on what a program sends, as `start` gives them. */
export interface Budgets {
  /** The longest line, in bytes. */
  readonly lineBytes: number;
  /** The longest page title, magazine name or section, in characters. */
  readonly titleCharacters: number;
  /** The longest author's log line, in bytes of UTF-8. */
  readonly authorLogBytes: number;
  /** The longest operator's log line, in characters. */
  readonly logCharacters: number;
  /** The connections one message may name. */
  readonly namedConnections: number;
  /** How long the server waits for an answer to `connected` or `selected`, in milliseconds. */
  readonly replyLimitMs: number;
}

/** What `start` tells a program of the limits it works within. */
export interface Limits {
  readonly standard: Standard;
  readonly budgets: Budgets;
}

/** `start`'s `standard` and `budgets`, which the schema has checked. */
export function readLimits(standard: WireStandard, budgets: WireBudgets): Limits {
  return {
    standard: {
      magazines: standard.magazines,
      pages: standard.pages,
      pagesPerMagazine: standard.pages_per_magazine,
      pagesInMagazine1: standard.pages_in_magazine_1,
      keyablePages: standard.keyable_pages,
      subpages: standard.subpages,
      decimalSubpages: standard.decimal_subpages,
    },
    budgets: {
      lineBytes: budgets.line_bytes,
      titleCharacters: budgets.title_characters,
      authorLogBytes: budgets.author_log_bytes,
      logCharacters: budgets.log_characters,
      namedConnections: budgets.named_connections,
      replyLimitMs: budgets.reply_limit_ms,
    },
  };
}
