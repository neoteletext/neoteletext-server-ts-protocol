// A sub-page of a TTI text as it is read (read-tti.ts), and the reading of
// a line's numeric fields, which every line's reader shares.

import { PAGE_RADIX } from "../page/page-numbers.ts";
import type { WireControl, WireEnhancement, WireKeyLink, WireLink, WireNumberLink, WirePackedLine, WireTextLink } from "../wire/protocol.ts";
import { DECIMAL } from "./format.ts";

/** A sub-page as it is read. */
export interface Being {
  readonly address: number;
  subcode: number | null;
  readonly rows: number[][];
  links: (WireLink | null)[];
  displayRow24: boolean;
  control: WireControl;
  nationalOption: number;
  region: number | null;
  readonly enhancements: WireEnhancement[];
  readonly packets: WirePackedLine[];
  readonly keys: WireKeyLink[];
  readonly numbers: WireNumberLink[];
  readonly texts: WireTextLink[];
  cursor: { row: number; column: number; block: boolean } | null;
}

/** A field's digits in `radix`: hexadecimal or decimal. */
const DIGITS: Readonly<Record<number, RegExp>> = { [PAGE_RADIX]: /^[0-9A-Fa-f]+$/u, [DECIMAL]: /^\d+$/u };

/** A field of a line as a whole number, or `fallback` where it is not one. */
export function wholeField(field: string | undefined, radix: number, fallback: number): number {
  const text = (field ?? "").trim();
  const value = DIGITS[radix]?.test(text) === true ? Number.parseInt(text, radix) : Number.NaN;
  return Number.isSafeInteger(value) ? value : fallback;
}
