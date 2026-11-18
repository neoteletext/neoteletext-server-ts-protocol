// A screen's Link Extension links (the engine's Appendix E; REQ-1494): the
// keys' links (TTI's `LN`), page numbers that are links (`LK`) and runs of
// text that are (`LT`), each held to the server's schema as it is declared.

import { COLUMNS } from "./geometry.ts";
import { type TargetKind, longestLabel, targetKind } from "./link-targets.ts";
import { isPageNumber, pageText } from "./page-numbers.ts";
import type { KeyLink, LinkExtension as LinkLists, LinkKey, NumberLink, TextLink } from "../wire/generated/protocol.js";

/** The Link Extension's bounds (the server's schema, $defs/LinkExtension; the engine's Appendix E). */
const MOST_NUMBER_LINKS = 8;
const MOST_TEXT_LINKS = 8;
const FIRST_TEXT_LINK_ROW = 1;
const LAST_TEXT_LINK_ROW = 23;
/** A target in a form of Appendix E.1, as the server reads it: `mpp`, `mpp:ssss`, `name:mpp`, `name:mpp:ssss`, an address, or `web:` and one. */
function checkTarget(call: string, target: string): TargetKind {
  const kind = targetKind(target);
  if (kind === null) {
    throw new RangeError(
      `${call}: a target is mpp, mpp:ssss, name:mpp, name:mpp:ssss, an http or https address, or web: and one, not ${JSON.stringify(target)}`,
    );
  }
  return kind;
}

/** Whether `value` is a whole number from 0 to `most`. */
export function within(value: number, most: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= most;
}

export class LinkExtension {
  readonly #keyLinks: KeyLink[] = [];
  readonly #numberLinks: NumberLink[] = [];
  readonly #textLinks: TextLink[] = [];

  /** A copy, declared on apart from this one. */
  copy(): LinkExtension {
    const copy = new LinkExtension();
    copy.#keyLinks.push(...this.#keyLinks);
    copy.#numberLinks.push(...this.#numberLinks);
    copy.#textLinks.push(...this.#textLinks);
    return copy;
  }

  /** A key's link, `label` its prompt: a key's second link replaces its first. */
  keyLink(key: LinkKey, target: string, label?: string): void {
    const most = longestLabel(checkTarget("keyLink", target));
    if (label !== undefined && (key === "index" || label.length === 0 || Array.from(label).length > most)) {
      throw new RangeError(`keyLink: a label is 1 to ${most} characters for this target, and the Index key has none`);
    }
    const at = this.#keyLinks.findIndex((link) => link.key === key);
    const link: KeyLink = { key, target, label: label ?? null };
    if (at >= 0) {
      this.#keyLinks[at] = link;
    } else {
      this.#keyLinks.push(link);
    }
  }

  /** A page number the page shows as a link, never to `web:`; at most 8. */
  numberLink(number: number, target: string): void {
    const kind = checkTarget("numberLink", target);
    if (!isPageNumber(number) || kind === "web" || this.#numberLinks.length >= MOST_NUMBER_LINKS) {
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
  wire(): LinkLists {
    return { keys: [...this.#keyLinks], numbers: [...this.#numberLinks], texts: [...this.#textLinks] };
  }
}
