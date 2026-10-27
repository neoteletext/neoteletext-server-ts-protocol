// TTI read back as the server's reader takes what Screen.toTti writes:
// each sub-page's rows, links and cursor, for tests and for the Fastext
// links of a page published from TTI. It reads the PN, OL, FL and CU lines
// in the escape form, and the packed OL,27 line of links that name a
// sub-page (packed-links.ts), and ignores every other line; the server
// reads TTI with the engine's reader.

import type { Cursor } from "../page/cursor.ts";
import { COLUMNS, ROWS, SPACE } from "../page/geometry.ts";
import { FIRST_PAGE, PAGE_DIGITS, PAGE_RADIX, isPageNumber } from "../page/page-numbers.ts";
import { DECIMAL, NO_LINK, olCodes } from "./format.ts";
import { PACKED_LINKS_ROW, readPackedLinks } from "./packed-links.ts";

/** A page as a receiver holds it: each row's codes. */
export type Rows = readonly (readonly number[])[];

/** One sub-page read back from TTI. */
export interface ReadPage {
  readonly subpage: number;
  readonly rows: Rows;
  /** The six links of the FL or packed OL,27 line: red, green, yellow, cyan, link 5 and the index; null for none. */
  readonly links: readonly (number | null)[];
  /** The sub-code each of those links names, null for any sub-page: an FL line names none. */
  readonly linkSubcodes: readonly (number | null)[];
  /** Whether row 24 is shown: an FL line shows it, a packed line says. */
  readonly fastextRow: boolean;
  readonly cursor: Cursor | null;
}

/** A sub-page as it is read, before its rows are done. */
interface PageBeingRead {
  readonly address: number;
  readonly subpage: number;
  readonly rows: number[][];
  links: (number | null)[];
  linkSubcodes: (number | null)[];
  fastextRow: boolean;
  cursor: Cursor | null;
}

/** A field of a line as a whole number, or `fallback` where it is not one. */
function wholeField(field: string | undefined, radix: number, fallback: number): number {
  const value = Number.parseInt(field ?? "", radix);
  return Number.isSafeInteger(value) ? value : fallback;
}

/** A PN line: the page and sub-page that the lines after it describe. */
function startPage(rest: string): PageBeingRead {
  return {
    address: wholeField(rest.slice(0, PAGE_DIGITS), PAGE_RADIX, FIRST_PAGE),
    subpage: wholeField(rest.slice(PAGE_DIGITS), DECIMAL, 0),
    rows: Array.from({ length: ROWS }, () => Array.from({ length: COLUMNS }, () => SPACE)),
    links: [],
    linkSubcodes: [],
    fastextRow: false,
    cursor: null,
  };
}

/** An OL line: a row's codes, cut at the row's end, or the packed links of row 27. */
function readRow(page: PageBeingRead, rest: string): void {
  const separator = rest.indexOf(",");
  const number = wholeField(rest.slice(0, separator), DECIMAL, -1);
  const text = rest.slice(separator + 1);
  if (number === PACKED_LINKS_ROW) {
    const read = readPackedLinks(page.address, text);
    if (read !== undefined) {
      page.links = read.links.map((link) => link?.page ?? null);
      page.linkSubcodes = read.links.map((link) => link?.subcode ?? null);
      page.fastextRow = read.displayRow24;
    }
    return;
  }
  const row = page.rows[number];
  if (row !== undefined) {
    olCodes(text)
      .slice(0, COLUMNS)
      .forEach((code, column) => {
        row[column] = code;
      });
  }
}

/** An FL line: the six links, each a page or none, and row 24 shown. */
function readLinks(page: PageBeingRead, rest: string): void {
  page.links = rest.split(",").map((field) => {
    const link = wholeField(field, PAGE_RADIX, NO_LINK);
    return link === NO_LINK || !isPageNumber(link) ? null : link;
  });
  page.linkSubcodes = page.links.map(() => null);
  page.fastextRow = true;
}

/** A CU line: the cursor's cell, its width and its flags. */
function readCursor(page: PageBeingRead, rest: string): void {
  const [row, column, width, flags] = rest.split(",").map((field) => wholeField(field, DECIMAL, 0));
  page.cursor = { row: row ?? 0, column: column ?? 0, width: width ?? 0, flags: flags ?? 0 };
}

/** Reads what {@link Screen.toTti} writes: PN, SC, OL, FL and CU lines. */
export function readTti(tti: string): ReadPage[] {
  const pages: PageBeingRead[] = [];
  let page: PageBeingRead | null = null;
  for (const line of tti.split("\n")) {
    const comma = line.indexOf(",");
    const command = line.slice(0, comma);
    const rest = line.slice(comma + 1);
    if (command === "PN") {
      page = startPage(rest);
      pages.push(page);
    } else if (page !== null && command === "OL") {
      readRow(page, rest);
    } else if (page !== null && command === "FL") {
      readLinks(page, rest);
    } else if (page !== null && command === "CU") {
      readCursor(page, rest);
    }
  }
  return pages.map(({ address: _address, ...read }) => read);
}
