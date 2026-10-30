// TTI, the engine's page format for files, read into the typed sub-pages
// the protocol carries (REQ-1478): TTI stays a format for files, never the
// interchange (DEC-1482 item 6). It reads as the engine's TTI reader does
// (neoteletext-formats' tti/commands.rs, packed.rs and links.rs): PN, SC,
// PS, RE, OL rows 0 to 24 in the 8-bit and escape forms, the packed lines
// OL,26 to OL,29, FL, CU, and the Link Extension's LN, LK and LT; every
// other line is passed over. What it reads is outside input: every value
// is bounded as it is read, and anything out of its bounds is dropped.

import { CODE_MASK, COLUMNS, ROWS, SPACE } from "../page/geometry.ts";
import { type ReadPage, type SubPageContent, NO_CONTROL, X27_LINKS, blankContent, encodeRow, readBack } from "../page/content.ts";
import { CursorFlag } from "../page/cursor.ts";
import { FIRST_PAGE, PAGE_DIGITS, PAGE_RADIX, isPageNumber, pageText } from "../page/page-numbers.ts";
import { type Being, wholeField } from "./being.ts";
import { DECIMAL, ESCAPE, ESCAPE_OFFSET, NO_LINK, olCodes } from "./format.ts";
import { ANY_SUBCODE } from "./packed-links.ts";
import { readKeyLink, readNumberLink, readTextLink } from "./read-link-lines.ts";
import { PACKET_ENHANCEMENT, PACKET_MAGAZINE_ENHANCEMENT, readPacked } from "./read-packed.ts";
import { SUBCODE_DIGITS, hex } from "./write-row.ts";

/** A page as a receiver holds it: each row's codes. */
export type Rows = readonly (readonly number[])[];

export type { ReadPage };

/** One sub-page of a TTI text: the page its PN line names, the sub-code its SC line gives, and its content. */
export interface TtiSubPage {
  readonly address: number;
  readonly subcode: number | null;
  readonly content: SubPageContent;
}

/** TTI's alias of Double Height in row text: a raw 0x10 (the engine's TTI_DOUBLE_HEIGHT_ALIAS). */
const DOUBLE_HEIGHT_ALIAS = 0x10;
/** Double Height (EN 300 706 Table 26). */
const DOUBLE_HEIGHT = 0x0d;

/** PS (the engine's decision E.21): bit 14 is C4; bits 0 to 6 are C5 to C11; bits 7, 8 and 9 are C12, C13 and C14. */
const PS_C4 = 0x4000;
const PS_C12_BIT = 7;
/** The national option is 4×C12 + 2×C13 + C14 (EN 300 706 clause 9.3.1.3). */
const NATIONAL_WEIGHTS = [0b100, 0b010, 0b001] as const;
/** The region, four bits (the engine's REGION_LAST). */
const LAST_REGION = 15;
/** Sub-codes are thirteen bits (EN 300 706 clause 9.3.1.2): 0000 to 3F7F. */
const SUBCODE_MASK = 0x3f7f;

function startPage(rest: string): Being {
  const address = wholeField(rest.slice(0, PAGE_DIGITS), PAGE_RADIX, FIRST_PAGE);
  return {
    address: isPageNumber(address) ? address : FIRST_PAGE,
    subcode: null,
    rows: Array.from({ length: ROWS }, () => Array.from({ length: COLUMNS }, () => SPACE)),
    links: Array.from({ length: X27_LINKS }, () => null),
    displayRow24: false,
    control: NO_CONTROL,
    nationalOption: 0,
    region: null,
    enhancements: [],
    packets: [],
    keys: [],
    numbers: [],
    texts: [],
    cursor: null,
  };
}

/** A row's codes from its text, TTI's Double Height alias undone: a raw 0x10 is read as Double Height in its escape form. */
function rowCodes(text: string): number[] {
  return olCodes(text.replaceAll(String.fromCodePoint(DOUBLE_HEIGHT_ALIAS), String.fromCodePoint(ESCAPE, DOUBLE_HEIGHT + ESCAPE_OFFSET)));
}

function readRow(page: Being, rest: string): void {
  const separator = rest.indexOf(",");
  const number = wholeField(rest.slice(0, separator), DECIMAL, -1);
  const text = rest.slice(separator + 1);
  if (number >= PACKET_ENHANCEMENT && number <= PACKET_MAGAZINE_ENHANCEMENT) {
    readPacked(page, number, text);
    return;
  }
  const row = page.rows[number];
  if (row !== undefined) {
    const codes = rowCodes(text);
    row.fill(SPACE);
    codes.slice(0, COLUMNS).forEach((code, column) => {
      row[column] = code & CODE_MASK;
    });
  }
}

/** An FL line: the six links, each a page or none, and row 24 shown. */
function readLinks(page: Being, rest: string): void {
  const fields = rest.split(",");
  page.links = Array.from({ length: X27_LINKS }, (_, index) => {
    const link = wholeField(fields[index], PAGE_RADIX, NO_LINK);
    return link === NO_LINK || !isPageNumber(link) ? null : { page: pageText(link), sub: hex(ANY_SUBCODE, SUBCODE_DIGITS) };
  });
  page.displayRow24 = true;
}

/** A PS line: the control bits and the national option. */
function readStatus(page: Being, rest: string): void {
  const status = wholeField(rest, PAGE_RADIX, 0);
  const bit = (index: number): boolean => ((status >> index) & 1) === 1;
  page.control = {
    erase: (status & PS_C4) !== 0,
    newsflash: bit(0),
    subtitle: bit(1),
    suppress_header: bit(2),
    update: bit(3),
    interrupted_sequence: bit(4),
    inhibit_display: bit(5),
    magazine_serial: bit(6),
  };
  page.nationalOption = NATIONAL_WEIGHTS.reduce((option, weight, index) => (bit(PS_C12_BIT + index) ? option | weight : option), 0);
}

/** A CU line: the cursor's cell and its flags; the third field, once the echo's width, is passed over. */
function readCursor(page: Being, rest: string): void {
  const [row, column, , flags] = rest.split(",").map((field) => wholeField(field, DECIMAL, -1));
  if (row !== undefined && column !== undefined && row >= 0 && row < ROWS && column >= 0 && column < COLUMNS) {
    page.cursor = { row, column, block: ((flags ?? 0) & CursorFlag.Block) !== 0 };
  }
}

function contentOf(page: Being): SubPageContent {
  return {
    ...blankContent(),
    rows: page.rows.map((row) => encodeRow(row)),
    links: page.links,
    display_row_24: page.displayRow24,
    link_extension: { keys: page.keys, numbers: page.numbers, texts: page.texts },
    control: page.control,
    character_set: { region: page.region, national_option: page.nationalOption },
    enhancements: page.enhancements,
    packets: page.packets,
    cursor: page.cursor,
  };
}

/** The line's command, upper case, and what follows its comma. */
function split(line: string): readonly [string, string] {
  const comma = line.indexOf(",");
  return comma < 0 ? [line.trim().toUpperCase(), ""] : [line.slice(0, comma).trim().toUpperCase(), line.slice(comma + 1)];
}

/** An SC line: the sub-code, 0000 to 3F7E. */
function readSubcode(page: Being, rest: string): void {
  const subcode = wholeField(rest, PAGE_RADIX, -1);
  page.subcode = subcode >= 0 && (subcode & ~SUBCODE_MASK) === 0 && subcode !== SUBCODE_MASK ? subcode : null;
}

/** An RE line: the region of the default character set, 0 to 15. */
function readRegion(page: Being, rest: string): void {
  const region = wholeField(rest, PAGE_RADIX, -1);
  page.region = region >= 0 && region <= LAST_REGION ? region : page.region;
}

/** Each line a sub-page reads by its command; the others are passed over. */
const LINES: Readonly<Record<string, (page: Being, rest: string) => void>> = {
  SC: readSubcode,
  OL: readRow,
  FL: readLinks,
  PS: readStatus,
  RE: readRegion,
  CU: readCursor,
  LN: readKeyLink,
  LK: readNumberLink,
  LT: readTextLink,
};

/** Every sub-page of a TTI text, each from its PN line, as the protocol's typed content. */
export function readTtiPages(tti: string): TtiSubPage[] {
  const pages: Being[] = [];
  let page: Being | null = null;
  for (const line of tti.replaceAll("\r", "").split("\n")) {
    const [command, rest] = split(line);
    if (command === "PN") {
      page = startPage(rest);
      pages.push(page);
    } else if (page !== null) {
      LINES[command]?.(page, rest);
    }
  }
  return pages.map((each) => ({ address: each.address, subcode: each.subcode, content: contentOf(each) }));
}

/** Every sub-page of a TTI text read back as a viewer sees it: for tests, and a picture's rows. */
export function readTti(tti: string): ReadPage[] {
  return readTtiPages(tti).map(({ subcode, content }) => readBack(content, subcode ?? 0));
}
