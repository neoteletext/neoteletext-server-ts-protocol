// A kept sub-page as the protocol carries it, and the small conversions
// every part of the channel shares.

import type { Copy } from "./copy.ts";
import { blankContent } from "../page/content.ts";
import { pageText } from "../page/page-numbers.ts";
import { SUBCODE_DIGITS, hex } from "../tti/write-row.ts";
import type { WirePage } from "../wire/protocol.ts";

/** 3F7F: the page and none of its sub-pages in particular (EN 300 706 clause 9.6.1). */
export const ANY_SUB = 0x3f7f;

/** A sub-code as the protocol writes it. */
export function subText(sub: number): string {
  return hex(sub, SUBCODE_DIGITS);
}

/** A selection as an address names its place: `302`, or `302/0002` for one sub-page. */
export function pathOf({ page, sub }: { readonly page: number; readonly sub: number }): string {
  return sub === ANY_SUB ? pageText(page) : `${pageText(page)}/${subText(sub)}`;
}

/** Sub-page `sub` of the copy as the protocol carries it; blank if the copy has none of that sub-code. */
export function wirePage(page: number, sub: number, copy: Copy): WirePage {
  const content = copy.subpages.get(sub)?.content ?? blankContent();
  return { page: pageText(page), sub: subText(sub), ...content };
}

/** `text` cut to at most `most` bytes of UTF-8, at a character's end. */
export function fitBytes(text: string, most: number): string {
  let fitted = "";
  for (const character of text) {
    if (Buffer.byteLength(fitted + character) > most) {
      break;
    }
    fitted += character;
  }
  return fitted;
}
