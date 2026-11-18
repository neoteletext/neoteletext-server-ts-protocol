// TTI's Link Extension lines (the engine's tti/links.rs, Appendix E;
// REQ-1494): `LN` a key's link, `LK` a page number's, `LT` a run of
// text's, each bounded as the server's schema bounds it.

import { type Being, wholeField } from "./being.ts";
import { DECIMAL } from "./format.ts";
import { COLUMNS } from "../page/geometry.ts";
import { longestLabel, targetKind } from "../page/link-targets.ts";
import { PAGE_RADIX, isPageNumber, pageText } from "../page/page-numbers.ts";
import type { LinkKey } from "../wire/generated/protocol.js";

/** The Link Extension's bounds (the schema's $defs/LinkExtension). */
const MOST_KEY_LINKS = 5;
const MOST_NUMBER_LINKS = 8;
const MOST_TEXT_LINKS = 8;
const FIRST_TEXT_LINK_ROW = 1;
const LAST_TEXT_LINK_ROW = 23;
const KEY_LETTERS: Readonly<Record<string, LinkKey>> = { R: "red", G: "green", Y: "yellow", C: "cyan", I: "index" };

/** `LN,key,target,label`. */
export function readKeyLink(page: Being, rest: string): void {
  const [letter = "", target = "", ...label] = rest.split(",");
  const key = KEY_LETTERS[letter.trim().toUpperCase()];
  const text = label.join(",");
  const kind = targetKind(target);
  if (key === undefined || kind === null || page.keys.length >= MOST_KEY_LINKS || page.keys.some((link) => link.key === key)) {
    return;
  }
  page.keys.push({ key, target, label: key === "index" || text === "" ? null : Array.from(text).slice(0, longestLabel(kind)).join("") });
}

/** `LK,mpp,target`. */
export function readNumberLink(page: Being, rest: string): void {
  const [number = "", ...target] = rest.split(",");
  const address = wholeField(number, PAGE_RADIX, -1);
  const text = target.join(",");
  const kind = targetKind(text);
  if (isPageNumber(address) && kind !== null && kind !== "web" && page.numbers.length < MOST_NUMBER_LINKS) {
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
  if (
    r >= FIRST_TEXT_LINK_ROW &&
    r <= LAST_TEXT_LINK_ROW &&
    c >= 0 &&
    l > 0 &&
    c + l <= COLUMNS &&
    targetKind(text) !== null &&
    page.texts.length < MOST_TEXT_LINKS
  ) {
    page.texts.push({ row: r, column: c, length: l, target: text });
  }
}
