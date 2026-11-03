// A page built as a terminal program builds its screen: text and colour at
// a row and column, Fastext links, a cursor; and the page in TTI, the
// engine's page format (docs/applications.md section 3.2). It mirrors
// teletext-server's crates/teletext-runtime/src/screen.rs.
//
// Text is Unicode with its language, which the server encodes (DEC-2199,
// REQ-2214): the screen keeps it as runs of text, and under each run's
// cells the code of the character where it is printable ASCII, a space
// otherwise, which the server writes over. Those codes are what reading
// the rows back (tests, a click on a page number) sees. The header row is
// the program's own codes, which the server never encodes.

import { Attribute, Colour, textColour } from "./colours.ts";
import { CursorFlag, FIRST_CURSOR_ROW, LAST_CURSOR_ROW, type Cursor } from "./cursor.ts";
import { type FastextLinks, NO_LINKS } from "./fastext.ts";
import { CODE_MASK, COLUMNS, HEADER_TEXT_COLUMN, ROWS, SPACE } from "./geometry.ts";
import { isPageNumber, pageText } from "./page-numbers.ts";
import { type SubPageContent, blankContent, encodeRow } from "./content.ts";
import { LinkExtension, within } from "./link-extension.ts";
import { codesTti, headerCodes, packedContent, packedLine, underCode } from "./screen-codes.ts";
import { TextRuns, cellsOf, textCells } from "./text-runs.ts";
import type { WireLanguageTag as LanguageTag, WireLinkKey, WireTextLevel } from "../wire/protocol.ts";

const ALL_FLAGS = CursorFlag.Block;

/** Any sub-page, in a link (EN 300 706 clause 9.6.1). */
const ANY_SUBCODE_TEXT = "3F7F";

/** A screen being drawn: 25 rows of 40 seven-bit codes, its links and cursor. */
export class Screen {
  readonly #rows: number[][];
  #fastext: FastextLinks = NO_LINKS;
  #index: number | null = null;
  #cursor: Cursor | null = null;
  #fastextRow = false;
  #links = new LinkExtension();
  #runs = new TextRuns();
  #language: LanguageTag | null = null;
  #level: WireTextLevel | null = null;
  readonly #packed: string[] = [];

  constructor() {
    this.#rows = Array.from({ length: ROWS }, () => Array.from({ length: COLUMNS }, () => SPACE));
  }

  /** A copy, drawn on apart from this one. */
  clone(): Screen {
    const copy = new Screen();
    this.#rows.forEach((line, row) => {
      copy.#rows[row] = [...line];
    });
    copy.#runs = new TextRuns(this.#runs);
    copy.#language = this.#language;
    copy.#level = this.#level;
    copy.#packed.push(...this.#packed);
    copy.#fastext = this.#fastext;
    copy.#index = this.#index;
    copy.#cursor = this.#cursor;
    copy.#fastextRow = this.#fastextRow;
    copy.#links = this.#links.copy();
    return copy;
  }

  /** Writes `codes` at `row`, `column`, cut at the row's end, over any text there; outside the page, nothing. */
  codes(row: number, column: number, codes: readonly number[]): void {
    const line = this.#rows[row];
    if (line === undefined || column < 0) {
      return;
    }
    this.#spaces(row, this.#runs.clear(row, column, codes.length));
    codes.forEach((code, offset) => {
      const at = column + offset;
      if (at < COLUMNS) {
        line[at] = code & CODE_MASK;
      }
    });
  }

  /** Spaces at `columns` of `row`: cells a run that was covered took. */
  #spaces(row: number, columns: readonly number[]): void {
    const line = this.#rows[row];
    for (const column of columns) {
      if (line !== undefined && column >= 0 && column < COLUMNS) {
        line[column] = SPACE;
      }
    }
  }

  code(row: number, column: number, code: number): void {
    this.codes(row, column, [code]);
  }

  /**
   * Writes `text` at `row`, `column`, a cell for each character it shows
   * (cellsOf), cut at the row's end: Unicode in `language`, a tag of
   * `start.languages`, or the page's when null, which the server encodes
   * (REQ-2214). Controls and format characters are shown as spaces. On
   * row 0, the header, it is the program's own codes (`header`).
   */
  text(row: number, column: number, text: string, language: LanguageTag | null = null): void {
    if (row === 0) {
      this.codes(row, column, headerCodes(text));
      return;
    }
    const line = this.#rows[row];
    if (line === undefined) {
      return;
    }
    const cells = textCells(text);
    this.#spaces(row, this.#runs.put(row, column, cells, language));
    cells.forEach((cell, offset) => {
      const at = column + offset;
      if (at >= 0 && at < COLUMNS) {
        line[at] = underCode(cell);
      }
    });
  }

  /** Writes `text` in `colour`: the colour attribute takes the cell before it. */
  coloured(row: number, column: number, colour: Colour, text: string, language: LanguageTag | null = null): void {
    this.code(row, column, textColour(colour));
    this.text(row, column + 1, text, language);
  }

  /** Writes `text` centred on `row` in `colour`. */
  centred(row: number, colour: Colour, text: string, language: LanguageTag | null = null): void {
    const width = cellsOf(text) + 1;
    const column = Math.floor(Math.max(0, COLUMNS - width) / 2);
    this.coloured(row, column, colour, text, language);
  }

  /** Writes a double-height line: the text on `row`, which also covers `row + 1` (EN 300 706 clause 12.3). */
  doubleHeight(row: number, column: number, colour: Colour, text: string, language: LanguageTag | null = null): void {
    this.code(row, column, Attribute.DoubleHeight);
    this.coloured(row, column + 1, colour, text, language);
  }

  /** The page's default language, a tag of `start.languages`: it sets the page's character sets and is the language of its text that names none (REQ-2214 item 2). Null for none: Latin English. */
  language(language: LanguageTag | null): void {
    this.#language = language;
  }

  /** The presentation level the page's text is written for (REQ-2151); null for NeoTeletext's own. */
  level(level: WireTextLevel | null): void {
    this.#level = level;
  }

  /** Adds a packed TTI line, OL,26 to OL,29 (REQ-INP-023): an enhancement packet, X/27, X/28 or M/29, as the engine's TTI writes it. */
  packed(line: string): void {
    this.#packed.push(packedLine(line));
  }

  /** Sets a background colour for the rest of `row` from `column`: the colour and New Background take two cells. */
  background(row: number, column: number, colour: Colour): void {
    this.codes(row, column, [textColour(colour), Attribute.NewBackground]);
  }

  /** The header row's text, after the receiver's page number: the program's own codes, so letters, digits and the signs every Latin national option shares. */
  header(text: string): void {
    this.codes(0, HEADER_TEXT_COLUMN, headerCodes(text));
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

  /** Places the cursor at `row`, `column`, with `flags` (DOC-1954). */
  cursor(row: number, column: number, flags: number): void {
    if (row < FIRST_CURSOR_ROW || !within(row, LAST_CURSOR_ROW) || !within(column, COLUMNS - 1) || !within(flags, ALL_FLAGS) || (flags & ~ALL_FLAGS) !== 0) {
      throw new RangeError(
        `cursor: row ${row}, column ${column} and flags ${flags} must be on rows ${FIRST_CURSOR_ROW} to ${LAST_CURSOR_ROW} of the page (DOC-1954)`,
      );
    }
    this.#cursor = { row, column, flags };
  }

  cursorLine(): Cursor | null {
    return this.#cursor;
  }

  /**
   * Declares the Link Extension link of a key (TTI's `LN`, the engine's
   * Appendix E; REQ-1494): `target` is `mpp`, `mpp:ssss`, `name:mpp`,
   * `name:mpp:ssss`, an `http` or `https` address, or `web:` and one;
   * `label` the prompt, at most 9 characters (8 for another service), none
   * for the Index key. A key's second link replaces its first.
   */
  keyLink(key: WireLinkKey, target: string, label?: string): void {
    this.#links.keyLink(key, target, label);
  }

  /** Declares a page number the page shows as a link to `target` (TTI's `LK`), never to `web:`; at most 8. */
  numberLink(number: number, target: string): void {
    this.#links.numberLink(number, target);
  }

  /** Declares the run of `length` characters from `row`, `column` a link to `target` (TTI's `LT`): rows 1 to 23, within the row; at most 8. */
  textLink(row: number, column: number, length: number, target: string): void {
    this.#links.textLink(row, column, length, target);
  }

  /** This screen as a sub-page's typed content (REQ-1478), for the page and sub-code it is put in. */
  content(): SubPageContent {
    const links = [...this.#fastext, null, this.#index].map((link) => (link === null ? null : { page: pageText(link), sub: ANY_SUBCODE_TEXT }));
    const cursor = this.#cursor;
    const text = this.#runs.runs((row, column) => this.at(row, column) === SPACE);
    const packed = packedContent(this.#packed);
    return {
      ...blankContent(),
      ...(this.#language === null ? {} : { language: this.#language }),
      ...(this.#level === null ? {} : { level: this.#level }),
      ...(text.length === 0 ? {} : { text }),
      ...packed,
      rows: this.#rows.map((row) => encodeRow(row)),
      links,
      display_row_24: this.#fastextRow || links.some((link) => link !== null),
      link_extension: this.#links.wire(),
      cursor: cursor === null ? null : { row: cursor.row, column: cursor.column, block: (cursor.flags & CursorFlag.Block) !== 0 },
    };
  }

  /**
   * This screen as a sub-page of page `page`, in TTI, with sub-code
   * `subcode` when it has one. The PN line's sub-page digits are 00: the
   * server takes a whole page's sub-pages by place and a put's by their SC
   * line (docs/applications.md section 3.2), never by PN.
   */
  toTti(page: number, subcode?: number): string {
    if (!this.#runs.empty || this.#language !== null || this.#level !== null) {
      throw new RangeError("toTti: TTI holds codes, and this screen holds text for the server to encode: publish the screen instead");
    }
    return codesTti({
      page,
      subcode,
      rows: this.#rows,
      links: [...this.#fastext, null, this.#index],
      fastextRow: this.#fastextRow,
      cursor: this.#cursor,
      packed: this.#packed,
    });
  }
}
