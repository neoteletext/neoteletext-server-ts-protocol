// A sub-page's content as the protocol carries it (REQ-1478): every field
// of the typed page but its number and sub-code, which the page it is put
// in gives it. Screen and the TTI reader both make it; the channel keeps
// it and sends it, one sub-page at a time (REQ-1501).

import type { Cursor } from "./cursor.ts";
import { CursorFlag } from "./cursor.ts";
import { COLUMNS, ROWS, SPACE } from "./geometry.ts";
import { PAGE_RADIX } from "./page-numbers.ts";
import type { WireControl, WirePage } from "../wire/protocol.ts";

/** One sub-page's content: a typed page without its `page` and `sub`. */
export type SubPageContent = Omit<WirePage, "page" | "sub">;

/** The six links of packet X/27/0 (EN 300 706 clause 9.6.1). */
export const X27_LINKS = 6;

/** No control bit set: the server sets C4 and C11 itself (docs/applications.md section 3). */
export const NO_CONTROL: WireControl = {
  erase: false,
  newsflash: false,
  subtitle: false,
  suppress_header: false,
  update: false,
  interrupted_sequence: false,
  inhibit_display: false,
  magazine_serial: false,
};

/** A row's 40 codes as base64 (RFC 4648 section 4), or null when every code is a space: the server's blank row. */
export function encodeRow(codes: readonly number[]): string | null {
  const bytes = Uint8Array.from({ length: COLUMNS }, (_, column) => codes[column] ?? SPACE);
  return bytes.every((code) => code === SPACE) ? null : Buffer.from(bytes).toString("base64");
}

/** A row as its 40 codes; a blank row's spaces. */
export function decodeRow(row: string | null | undefined): number[] {
  if (row === null || row === undefined) {
    return Array.from({ length: COLUMNS }, () => SPACE);
  }
  return [...Buffer.from(row, "base64")].slice(0, COLUMNS);
}

/** A sub-page's 25 rows as codes. */
export function rowsOf(content: SubPageContent): number[][] {
  return Array.from({ length: ROWS }, (_, row) => decodeRow(content.rows[row]));
}

/** A blank sub-page: every row spaces, no links. */
export function blankContent(): SubPageContent {
  return {
    rows: Array.from({ length: ROWS }, () => null),
    links: Array.from({ length: X27_LINKS }, () => null),
    display_row_24: false,
    link_extension: { keys: [], numbers: [], texts: [] },
    control: NO_CONTROL,
    character_set: { region: null, national_option: 0 },
    enhancements: [],
    packets: [],
    cursor: null,
  };
}

/** One sub-page read back: what a viewer sees of it, for tests and to follow a click. */
export interface ReadPage {
  /** Its sub-code. */
  readonly subpage: number;
  readonly rows: readonly (readonly number[])[];
  /** The six links: red, green, yellow, cyan, link 5 and the index; null for none. */
  readonly links: readonly (number | null)[];
  /** The sub-code each of those links names, null for any sub-page. */
  readonly linkSubcodes: readonly (number | null)[];
  /** Whether row 24 is shown. */
  readonly fastextRow: boolean;
  readonly cursor: Cursor | null;
}

/** The sub-code that means any sub-page (EN 300 706 clause 9.6.1). */
const ANY = 0x3f7f;

/** `content` read back, as sub-code `subpage`. */
export function readBack(content: SubPageContent, subpage: number): ReadPage {
  const cursor = content.cursor ?? null;
  return {
    subpage,
    rows: rowsOf(content),
    links: content.links.map((link) => (link === null ? null : Number.parseInt(link.page, PAGE_RADIX))),
    linkSubcodes: content.links.map((link) => {
      if (link === null) {
        return null;
      }
      const sub = Number.parseInt(link.sub, PAGE_RADIX);
      return sub === ANY ? null : sub;
    }),
    fastextRow: content.display_row_24,
    cursor: cursor === null ? null : { row: cursor.row, column: cursor.column, flags: cursor.block ? CursorFlag.Block : 0 },
  };
}
