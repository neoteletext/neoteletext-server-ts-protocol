// Every page is sent its own clicks (INPUT.md section 6.3), so a click the
// page does not take follows what it is on, as the browser would: a
// Fastext prompt in row 24, or a page number.

import { Colour, textColour } from "../page/colours.ts";
import type { FastextLinks } from "../page/fastext.ts";
import { ROWS } from "../page/geometry.ts";
import { PAGE_DIGITS, PAGE_RADIX, isPageNumber } from "../page/page-numbers.ts";
import type { Rows } from "../tti/read-tti.ts";

/** The row of the Fastext prompts, the page's last (EN 300 706 clause 9.6). */
export const FASTEXT_ROW = ROWS - 1;

/** Each coloured key's prompt colour in row 24, red to cyan (the engine's REQ-NAV-011). */
const PROMPT_COLOURS: readonly number[] = [Colour.Red, Colour.Green, Colour.Yellow, Colour.Cyan].map((colour) => textColour(colour));

/** Every alphanumeric colour code, any of which ends the prompt before it (EN 300 706 Table 26). */
const TEXT_COLOURS: ReadonlySet<number> = new Set(Object.values(Colour).map((colour) => textColour(colour)));

/** The codes of the digits 0 to 9 (EN 300 706 Table 36). */
const DIGIT_ZERO = 0x30;

const DIGIT_NINE = 0x39;

/** What a viewer sees of a page, to follow a click on it: its rows and its Fastext links. */
export interface PageView {
  readonly rows: Rows;
  readonly links: FastextLinks;
}

/** Which coloured key's prompt in row 24 is at `column`, 0 (red) to 3 (cyan): a prompt runs from its colour code to the next colour code. */
export function promptAt(codes: readonly number[], column: number): number | null {
  for (let at = Math.min(column, codes.length - 1); at >= 0; at -= 1) {
    const code = codes[at] ?? 0;
    if (TEXT_COLOURS.has(code)) {
      const key = PROMPT_COLOURS.indexOf(code);
      return key === -1 ? null : key;
    }
  }
  return null;
}

/** The Fastext link of the row 24 prompt at `column`. */
export function promptLink(view: PageView, column: number): number | null {
  const key = promptAt(view.rows[FASTEXT_ROW] ?? [], column);
  return key === null ? null : (view.links[key] ?? null);
}

/** The page whose three digits stand at `column` on their own, if any. */
export function numberAt(codes: readonly number[], column: number): number | null {
  const isDigit = (at: number): boolean => {
    const code = codes[at];
    return code !== undefined && code >= DIGIT_ZERO && code <= DIGIT_NINE;
  };
  if (!isDigit(column)) {
    return null;
  }
  let start = column;
  while (start > 0 && isDigit(start - 1)) {
    start -= 1;
  }
  let end = column;
  while (isDigit(end + 1)) {
    end += 1;
  }
  if (end - start + 1 !== PAGE_DIGITS) {
    return null;
  }
  const page = Number.parseInt(String.fromCodePoint(...codes.slice(start, end + 1)), PAGE_RADIX);
  return isPageNumber(page) ? page : null;
}

/** The page a click at a cell goes to: a Fastext prompt's link in row 24, or a page number it is on. */
export function clickedLink(view: PageView, column: number, row: number): number | null {
  const codes = view.rows[row];
  if (codes === undefined || column < 0 || column >= codes.length) {
    return null;
  }
  return row === FASTEXT_ROW ? promptLink(view, column) : numberAt(codes, column);
}
