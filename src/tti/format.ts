// The conventions of TTI's text, which every line writer and reader here
// shares. An OL line carries a row's codes in the escape form (the
// engine's TTI reader, REQ-INP-013): a control code 0x00 to 0x1F as ESC
// and the code plus 0x40, so the line is plain ASCII.

import { CODE_MASK } from "../page/geometry.ts";

/** ESC, which starts an escaped control code in an OL line. */
export const ESCAPE = 0x1b;

/** What is added to a control code after ESC: 0x00 to 0x1F become 0x40 to 0x5F. */
export const ESCAPE_OFFSET = 0x40;

/** The last control code: the spacing attributes are 0x00 to 0x1F (EN 300 706 Table 26). */
export const LAST_CONTROL = 0x1f;

/** TTI's FL value for no link (the engine's TTI_FL_NULL_LINK). */
export const NO_LINK = 0x8ff;

/** TTI writes sub-page numbers and rows in decimal. */
export const DECIMAL = 10;

/**
 * The codes of an OL line's text, its escapes undone. Each is kept to seven
 * bits, and an ESC with nothing after it ends the line: TTI read from a
 * file is outside input, and a code past 0x7F or a dangling escape is
 * dropped, never stored.
 */
export function olCodes(text: string): number[] {
  const codes: number[] = [];
  let escaped = false;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (escaped) {
      codes.push((code - ESCAPE_OFFSET) & CODE_MASK);
      escaped = false;
    } else if (code === ESCAPE) {
      escaped = true;
    } else {
      codes.push(code & CODE_MASK);
    }
  }
  return codes;
}
