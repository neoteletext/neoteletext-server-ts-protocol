// A row's codes as an OL line's text, and the other pieces of TTI the
// screen writes.

import { SPACE } from "../page/geometry.ts";
import { ESCAPE, ESCAPE_OFFSET, LAST_CONTROL } from "./format.ts";

/** The hexadecimal digits of a sub-code in TTI's SC line. */
export const SUBCODE_DIGITS = 4;

export function hex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, "0");
}

/**
 * A row's codes as an OL line's text in the escape form: each control
 * code as ESC and the code plus 0x40, every other code as its character,
 * so the line is plain ASCII. Trailing spaces are left out; the reader
 * restores them.
 */
export function rowText(codes: readonly number[]): string {
  let end = codes.length;
  while (end > 0 && codes[end - 1] === SPACE) {
    end -= 1;
  }
  return codes
    .slice(0, end)
    .map((code) => (code <= LAST_CONTROL ? String.fromCodePoint(ESCAPE, code + ESCAPE_OFFSET) : String.fromCodePoint(code)))
    .join("");
}
