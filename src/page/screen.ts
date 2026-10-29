// A page built as a terminal program builds its screen: text and colour at
// a row and column, Fastext links, a cursor; and the page in TTI, the
// engine's page format (docs/applications.md section 3.2). It mirrors
// teletext-server's crates/teletext-runtime/src/screen.rs.

import { Attribute, Colour, textColour } from "./colours.ts";
import { CursorFlag, type Cursor } from "./cursor.ts";
import { type FastextLinks, NO_LINKS } from "./fastext.ts";
import { CODE_MASK, COLUMNS, HEADER_TEXT_COLUMN, ROWS, SPACE } from "./geometry.ts";
import { isPageNumber, pageText } from "./page-numbers.ts";
import { englishCodes } from "../text/english.ts";
import { NO_LINK } from "../tti/format.ts";
import { SUBCODE_DIGITS, hex, rowText } from "../tti/write-row.ts";

/** The sub-page digits of a PN line, which the server does not read. */
const PN_SUBPAGE = "00";

const ALL_FLAGS = CursorFlag.Block;

/** Whether `value` is a whole number from 0 to `most`. */
function within(value: number, most: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= most;
}

/** A screen being drawn: 25 rows of 40 seven-bit codes, its links and cursor. */
export class Screen {
  readonly #rows: number[][];
  #fastext: FastextLinks = NO_LINKS;
  #index: number | null = null;
  #cursor: Cursor | null = null;
  #fastextRow = false;

  constructor() {
    this.#rows = Array.from({ length: ROWS }, () => Array.from({ length: COLUMNS }, () => SPACE));
  }

  /** A copy, drawn on apart from this one. */
  clone(): Screen {
    const copy = new Screen();
    this.#rows.forEach((line, row) => {
      copy.codes(row, 0, line);
    });
    copy.#fastext = this.#fastext;
    copy.#index = this.#index;
    copy.#cursor = this.#cursor;
    copy.#fastextRow = this.#fastextRow;
    return copy;
  }

  /** Writes `codes` at `row`, `column`, cut at the row's end; outside the page, nothing. */
  codes(row: number, column: number, codes: readonly number[]): void {
    const line = this.#rows[row];
    if (line === undefined || column < 0) {
      return;
    }
    codes.forEach((code, offset) => {
      const at = column + offset;
      if (at < COLUMNS) {
        line[at] = code & CODE_MASK;
      }
    });
  }

  code(row: number, column: number, code: number): void {
    this.codes(row, column, [code]);
  }

  /** Writes `text` at `row`, `column` in the English option set, cut at the row's end. */
  text(row: number, column: number, text: string): void {
    this.codes(row, column, englishCodes(text));
  }

  /** Writes `text` in `colour`: the colour attribute takes the cell before it. */
  coloured(row: number, column: number, colour: Colour, text: string): void {
    this.code(row, column, textColour(colour));
    this.text(row, column + 1, text);
  }

  /** Writes `text` centred on `row` in `colour`. */
  centred(row: number, colour: Colour, text: string): void {
    const width = englishCodes(text).length + 1;
    const column = Math.floor(Math.max(0, COLUMNS - width) / 2);
    this.coloured(row, column, colour, text);
  }

  /** Writes a double-height line: the text on `row`, which also covers `row + 1` (EN 300 706 clause 12.3). */
  doubleHeight(row: number, column: number, colour: Colour, text: string): void {
    this.code(row, column, Attribute.DoubleHeight);
    this.coloured(row, column + 1, colour, text);
  }

  /** Sets a background colour for the rest of `row` from `column`: the colour and New Background take two cells. */
  background(row: number, column: number, colour: Colour): void {
    this.codes(row, column, [textColour(colour), Attribute.NewBackground]);
  }

  /** The header row's text, after the receiver's page number. */
  header(text: string): void {
    this.text(0, HEADER_TEXT_COLUMN, text);
  }

  /** Fills `count` cells of `row` from `column` with `code`. */
  fill(row: number, column: number, count: number, code: number): void {
    this.codes(
      row,
      column,
      Array.from({ length: Math.max(0, count) }, () => code),
    );
  }

  /** The code at `row`, `column`; a space outside the page. */
  at(row: number, column: number): number {
    return this.#rows[row]?.[column] ?? SPACE;
  }

  /** A row's codes, or undefined outside the page. */
  row(row: number): readonly number[] | undefined {
    return this.#rows[row];
  }

  /** The text of `row`, for tests: the codes as characters. */
  rowText(row: number): string {
    return String.fromCodePoint(...(this.#rows[row] ?? []));
  }

  /** Sets the Fastext links: red, green, yellow, cyan (EN 300 706 clause 9.6). */
  fastext(links: FastextLinks): void {
    if (links.some((link) => link !== null && !isPageNumber(link))) {
      throw new RangeError(`fastext: each link is a page number or null, not ${links.join(", ")}`);
    }
    this.#fastext = links;
  }

  fastextLinks(): FastextLinks {
    return this.#fastext;
  }

  /** Sets the Index link, which the Index key follows (EN 300 706 clause 9.6, link 6). */
  indexLink(page: number): void {
    if (!isPageNumber(page)) {
      throw new RangeError(`indexLink: ${page} is not a page number`);
    }
    this.#index = page;
  }

  index(): number | null {
    return this.#index;
  }

  /** Shows row 24 although the page has no links (EN 300 706 Table 14, the link control byte's bit 4). */
  showFastextRow(): void {
    this.#fastextRow = true;
  }

  /** Places the cursor at `row`, `column`, with `flags` (INPUT.md section 7.1). */
  cursor(row: number, column: number, flags: number): void {
    if (!within(row, ROWS - 1) || !within(column, COLUMNS - 1) || !within(flags, ALL_FLAGS) || (flags & ~ALL_FLAGS) !== 0) {
      throw new RangeError(`cursor: row ${row}, column ${column} and flags ${flags} must be on the page`);
    }
    this.#cursor = { row, column, flags };
  }

  cursorLine(): Cursor | null {
    return this.#cursor;
  }

  /**
   * This screen as a sub-page of page `page`, in TTI, with sub-code
   * `subcode` when it has one. The PN line's sub-page digits are 00: the
   * server takes a whole page's sub-pages by place and a put's by their SC
   * line (docs/applications.md section 3.2), never by PN.
   */
  toTti(page: number, subcode?: number): string {
    const lines = [`PN,${pageText(page)}${PN_SUBPAGE}`, ...(subcode === undefined ? [] : [`SC,${hex(subcode, SUBCODE_DIGITS)}`])];
    for (const [row, codes] of this.#rows.entries()) {
      lines.push(`OL,${row},${rowText(codes)}`);
    }
    const links = [...this.#fastext, null, this.#index];
    if (this.#fastextRow || links.some((link) => link !== null)) {
      lines.push(`FL,${links.map((link) => pageText(link ?? NO_LINK)).join(",")}`);
    }
    if (this.#cursor !== null) {
      const { row, column, flags } = this.#cursor;
      // The third field, once the echo's width, keeps its place, written 0
      // (the engine's E.134).
      lines.push(`CU,${row},${column},0,${flags}`);
    }
    return lines.map((line) => `${line}\n`).join("");
  }
}
