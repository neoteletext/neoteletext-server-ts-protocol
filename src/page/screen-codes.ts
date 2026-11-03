// The codes a screen writes itself, beside the text the server encodes: the
// header, which is the program's own codes; the code under each cell of a
// run, for reading the rows back; and the packed lines a program writes in
// the engine's own form.

import type { SubPageContent } from "./content.ts";
import { SPACE } from "./geometry.ts";
import { FIRST_PAGE, pageText } from "./page-numbers.ts";
import type { Cursor } from "./cursor.ts";
import { readTtiPages } from "../tti/read-tti.ts";
import { NO_LINK } from "../tti/format.ts";
import { SUBCODE_DIGITS, hex, rowText } from "../tti/write-row.ts";

/** The sub-page digits of a PN line, which the server does not read. */
const PN_SUBPAGE = "00";

/** Printable ASCII, the codes a run's cells hold under it for reading back (EN 300 706 Table 35). */
const FIRST_PRINTABLE = 0x20;
const LAST_PRINTABLE = 0x7e;
/**
 * The codes at which EN 300 706 Table 36's Latin national options differ
 * (0x23, 0x24, 0x40, 0x5B to 0x60, 0x7B to 0x7E): the header is the
 * program's own codes, so it holds only those every option shows alike.
 */
const NATIONAL_CODES = /[#$@[\\\]^_`{|}~]/u;
/** A packed line of TTI, OL,26 to OL,29 (REQ-INP-023): the engine's own form of a packet. */
const PACKED_LINE = /^OL,2[6-9],[^\n]*$/u;

/** The code under a run's cell: its character's where that is printable ASCII, else a space. */
export function underCode(cell: string): number {
  const point = cell.codePointAt(0) ?? SPACE;
  return Array.from(cell).length === 1 && point >= FIRST_PRINTABLE && point <= LAST_PRINTABLE ? point : SPACE;
}

/** The header's codes: letters, digits, spaces and the signs every Latin national option shows alike. */
export function headerCodes(text: string): number[] {
  return Array.from(text, (character) => {
    const point = character.codePointAt(0) ?? SPACE;
    if (point < FIRST_PRINTABLE || point > LAST_PRINTABLE || NATIONAL_CODES.test(character)) {
      throw new RangeError(
        `header: the header is the program's own codes, which the server does not encode: letters, digits and the signs every national option shares, not ${JSON.stringify(character)}`,
      );
    }
    return point;
  });
}

/** `line` if it is a packed line, OL,26 to OL,29, on one line. */
export function packedLine(line: string): string {
  if (!PACKED_LINE.test(line)) {
    throw new RangeError(`packed: a packed line is OL,26 to OL,29 and its characters, not ${JSON.stringify(line.slice(0, 8))}`);
  }
  return line;
}

/** The enhancement packets and other packed lines `lines` hold, read as the engine's TTI reader reads them. */
export function packedContent(lines: readonly string[]): Pick<SubPageContent, "enhancements" | "packets"> {
  const read = readTtiPages(`PN,${pageText(FIRST_PAGE)}${PN_SUBPAGE}\n${lines.join("\n")}\n`)[0]?.content;
  return { enhancements: read?.enhancements ?? [], packets: read?.packets ?? [] };
}

/** What a screen of codes writes as TTI. */
export interface CodesParts {
  readonly page: number;
  readonly subcode: number | undefined;
  readonly rows: readonly (readonly number[])[];
  /** The six links of X/27/0, null for none. */
  readonly links: readonly (number | null)[];
  readonly fastextRow: boolean;
  readonly cursor: Cursor | null;
  readonly packed: readonly string[];
}

/** A screen of codes as TTI, from its PN line: SC when it has a sub-code, its rows, FL, CU and its packed lines. */
export function codesTti({ page, subcode, rows, links, fastextRow, cursor, packed }: CodesParts): string {
  const lines = [`PN,${pageText(page)}${PN_SUBPAGE}`, ...(subcode === undefined ? [] : [`SC,${hex(subcode, SUBCODE_DIGITS)}`])];
  for (const [row, codes] of rows.entries()) {
    lines.push(`OL,${row},${rowText(codes)}`);
  }
  if (fastextRow || links.some((link) => link !== null)) {
    lines.push(`FL,${links.map((link) => pageText(link ?? NO_LINK)).join(",")}`);
  }
  if (cursor !== null) {
    // The third field, once the echo's width, keeps its place, written 0
    // (the engine's E.134).
    lines.push(`CU,${cursor.row},${cursor.column},0,${cursor.flags}`);
  }
  lines.push(...packed);
  return lines.map((line) => `${line}\n`).join("");
}
