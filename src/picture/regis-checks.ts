// What the Regis builder checks before it writes (renderer parity PAR-39): a
// number against a limit of the ReGIS renderer, named by the renderer's own
// name (regis-limits.ts), and a label's or title's text. A check that fails
// throws, naming the call and the bound.

import { MAX_COORDINATE, MIN_COORDINATE } from "./regis-limits.ts";

/** The first and last bytes a ReGIS quoted string keeps as text: printable ASCII, then 10/0 to 15/15 (manual chapter 1; regis-v2.md "Attributes", read as ISO/IEC 8859-1). */
const FIRST_PRINTABLE = 0x20;
const LAST_PRINTABLE = 0x7e;
const FIRST_UPPER_HALF = 0xa0;
const LAST_UPPER_HALF = 0xff;
/** The quote a title or label is written between; doubled inside it (manual chapter 1, "Quoted Strings"). */
const QUOTE = "'";

/** Throws unless `value` is an integer from `least` to `most`, naming the call, what it is and the bound by its name. */
export function within(call: string, what: string, value: number, least: number, most: number, bound: string): void {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new RangeError(`Regis.${call}: ${what} ${String(value)} is not an integer from ${least} to ${most} (${bound})`);
  }
}

/** Throws unless `value` is a coordinate the renderer keeps, MIN_COORDINATE to MAX_COORDINATE (manual chapter 1, "Numeric Values"). */
export function coordinate(call: string, what: string, value: number): void {
  within(call, what, value, MIN_COORDINATE, MAX_COORDINATE, `MIN_COORDINATE to MAX_COORDINATE`);
}

/** `text` quoted as a v2 label or title (regis-v2.md "Attributes"): plain ISO/IEC 8859-1 text of at most `most` bytes, the quote doubled. */
export function quoted(call: string, text: string, most: number, bound: string): string {
  let length = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < FIRST_PRINTABLE || code > LAST_PRINTABLE) && (code < FIRST_UPPER_HALF || code > LAST_UPPER_HALF)) {
      throw new RangeError(`Regis.${call}: ${JSON.stringify(character)} is not plain ISO/IEC 8859-1 text, which a v2 label or title is (regis-v2.md)`);
    }
    length += 1;
  }
  if (length > most) {
    throw new RangeError(`Regis.${call}: ${length} bytes, at most ${most} (${bound})`);
  }
  return `${QUOTE}${text.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`;
}
