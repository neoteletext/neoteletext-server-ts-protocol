// A screen's Link Extension links (the engine's Appendix E; REQ-1494): the
// keys' links (TTI's `LN`), page numbers that are links (`LK`) and runs of
// text that are (`LT`), each held to the server's schema as it is declared.

import { COLUMNS } from "./geometry.ts";
import { isPageNumber, pageText } from "./page-numbers.ts";
import type { WireKeyLink, WireLinkExtension, WireLinkKey, WireNumberLink, WireTextLink } from "../wire/protocol.ts";

/** The Link Extension's bounds (the server's schema, $defs/LinkExtension; the engine's Appendix E). */
const MOST_NUMBER_LINKS = 8;
const MOST_TEXT_LINKS = 8;
/** The longest address of REQ-1661 and a `web:` mark. */
const LONGEST_TARGET = 8004;
const LONGEST_LABEL = 9;
const FIRST_TEXT_LINK_ROW = 1;
const LAST_TEXT_LINK_ROW = 23;
/** A target: `mpp`, `mpp:ssss`, `name:mpp`, an address, `web:` and one; printable ASCII without spaces or commas (Appendix E.1). */
const TARGET = /^[!-+\--~]+$/u;

function checkTarget(kind: string, target: string): void {
  if (target.length > LONGEST_TARGET || !TARGET.test(target)) {
    throw new RangeError(`${kind}: a target is printable ASCII without spaces or commas, at most ${LONGEST_TARGET} bytes, not ${JSON.stringify(target)}`);
  }
}

/** Whether `value` is a whole number from 0 to `most`. */
export function within(value: number, most: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= most;
}

export class LinkExtension {
  readonly #keyLinks: WireKeyLink[] = [];
  readonly #numberLinks: WireNumberLink[] = [];
  readonly #textLinks: WireTextLink[] = [];

  /** A copy, declared on apart from this one. */
  copy(): LinkExtension {
    const copy = new LinkExtension();
    copy.#keyLinks.push(...this.#keyLinks);
    copy.#numberLinks.push(...this.#numberLinks);
    copy.#textLinks.push(...this.#textLinks);
    return copy;
  }

  /** A key's link, `label` its prompt: a key's second link replaces its first. */
  keyLink(key: WireLinkKey, target: string, label?: string): void {
    checkTarget("keyLink", target);
    if (label !== undefined && (key === "index" || label.length === 0 || Array.from(label).length > LONGEST_LABEL)) {
      throw new RangeError(`keyLink: a label is 1 to ${LONGEST_LABEL} characters, and the Index key has none`);
    }
    const at = this.#keyLinks.findIndex((link) => link.key === key);
    const link: WireKeyLink = { key, target, label: label ?? null };
    if (at >= 0) {
      this.#keyLinks[at] = link;
    } else {
      this.#keyLinks.push(link);
    }
  }

  /** A page number the page shows as a link, never to `web:`; at most 8. */
  numberLink(number: number, target: string): void {
    checkTarget("numberLink", target);
    if (!isPageNumber(number) || target.startsWith("web:") || this.#numberLinks.length >= MOST_NUMBER_LINKS) {
      throw new RangeError(`numberLink: a page number, a target that is not web:, at most ${MOST_NUMBER_LINKS} links`);
    }
    this.#numberLinks.push({ number: pageText(number), target });
  }

  /** A run of `length` cells from `row`, `column` as a link: rows 1 to 23, within the row; at most 8. */
  textLink(row: number, column: number, length: number, target: string): void {
    checkTarget("textLink", target);
    if (
      !within(row, LAST_TEXT_LINK_ROW) ||
      row < FIRST_TEXT_LINK_ROW ||
      !within(column, COLUMNS - 1) ||
      length < 1 ||
      column + length > COLUMNS ||
      this.#textLinks.length >= MOST_TEXT_LINKS
    ) {
      throw new RangeError(`textLink: rows ${FIRST_TEXT_LINK_ROW} to ${LAST_TEXT_LINK_ROW}, the run within the row, at most ${MOST_TEXT_LINKS} links`);
    }
    this.#textLinks.push({ row, column, length, target });
  }

  /** The links as the protocol carries them. */
  wire(): WireLinkExtension {
    return { keys: [...this.#keyLinks], numbers: [...this.#numberLinks], texts: [...this.#textLinks] };
  }
}
