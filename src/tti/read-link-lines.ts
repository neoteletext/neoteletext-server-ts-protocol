// TTI's Link Extension lines (the engine's tti/links.rs, Appendix E;
// REQ-1494): `LN` a key's link, `LK` a page number's, `LT` a run of
// text's, each bounded as the server's schema bounds it.

import { type Being, wholeField } from "./being.ts";
import { DECIMAL } from "./format.ts";
import { COLUMNS } from "../page/geometry.ts";
import { PAGE_RADIX, isPageNumber, pageText } from "../page/page-numbers.ts";
import type { WireLinkKey } from "../wire/protocol.ts";

/** The Link Extension's bounds (the schema's $defs/LinkExtension). */
const MOST_KEY_LINKS = 5;
const MOST_NUMBER_LINKS = 8;
const MOST_TEXT_LINKS = 8;
/** The longest address of REQ-1661 and a `web:` mark. */
const LONGEST_TARGET = 8004;
const LONGEST_LABEL = 9;
const FIRST_TEXT_LINK_ROW = 1;
const LAST_TEXT_LINK_ROW = 23;
/** A target: printable ASCII without spaces or commas (Appendix E.1). */
const TARGET = /^[!-+\--~]+$/u;
const KEY_LETTERS: Readonly<Record<string, WireLinkKey>> = { R: "red", G: "green", Y: "yellow", C: "cyan", I: "index" };

function isTarget(text: string): boolean {
  return text.length <= LONGEST_TARGET && TARGET.test(text);
}

/** `LN,key,target,label`. */
export function readKeyLink(page: Being, rest: string): void {
  const [letter = "", target = "", ...label] = rest.split(",");
  const key = KEY_LETTERS[letter.trim().toUpperCase()];
  const text = label.join(",");
  if (key === undefined || !isTarget(target) || page.keys.length >= MOST_KEY_LINKS || page.keys.some((link) => link.key === key)) {
    return;
  }
  page.keys.push({ key, target, label: key === "index" || text === "" ? null : Array.from(text).slice(0, LONGEST_LABEL).join("") });
}

/** `LK,mpp,target`. */
export function readNumberLink(page: Being, rest: string): void {
  const [number = "", ...target] = rest.split(",");
  const address = wholeField(number, PAGE_RADIX, -1);
  const text = target.join(",");
  if (isPageNumber(address) && isTarget(text) && !text.startsWith("web:") && page.numbers.length < MOST_NUMBER_LINKS) {
    page.numbers.push({ number: pageText(address), target: text });
  }
}

/** `LT,row,column,length,target`. */
export function readTextLink(page: Being, rest: string): void {
  const [row = "", column = "", length = "", ...target] = rest.split(",");
  const [r, c, l] = [row, column, length].map((field) => wholeField(field, DECIMAL, -1));
  const text = target.join(",");
  if (r === undefined || c === undefined || l === undefined) {
    return;
  }
  if (r >= FIRST_TEXT_LINK_ROW && r <= LAST_TEXT_LINK_ROW && c >= 0 && l > 0 && c + l <= COLUMNS && isTarget(text) && page.texts.length < MOST_TEXT_LINKS) {
    page.texts.push({ row: r, column: c, length: l, target: text });
  }
}
