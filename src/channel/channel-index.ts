// The channel's index for `reply` and `index` (REQ-1477): its magazines in
// ascending order, each with its name and its pages in ascending order,
// each page's title, section and sub-page count; page-level, never listing
// sub-pages (DEC-1500 item 5). Every text is cut to `start`'s
// `title_characters`, and the bounds the standard sets are kept.

import type { PageEntry } from "./application.ts";
import { pageText } from "../page/page-numbers.ts";
import type { Limits } from "../wire/limits.ts";
import type { WireIndexEntry, WireMagazine } from "../wire/protocol.ts";

/** A page number's magazine: its first hexadecimal digit (EN 300 706 clause 7.1.2). */
const MAGAZINE_SHIFT = 8;
const PAGE_MASK = 0xff;
/** The pages no magazine carries: mFD, mFE and mFF, and 1BE and 1F0 (Annex A.10). */
const RESERVED_IN_EVERY_MAGAZINE: ReadonlySet<number> = new Set([0xfd, 0xfe, 0xff]);
const RESERVED_PAGES: ReadonlySet<number> = new Set([0x1be, 0x1f0]);
const FIRST_MAGAZINE = 1;

/** Whether the standard reserves `page`, so no index may list it. */
export function isReserved(page: number): boolean {
  return RESERVED_IN_EVERY_MAGAZINE.has(page & PAGE_MASK) || RESERVED_PAGES.has(page);
}

/**
 * `text` cut to `most` characters, controls made spaces, in Unicode
 * normalisation form C: the server refuses a control in a title, and text
 * not in NFC. Composing never lengthens the cut text, which is a prefix of
 * text already in NFC.
 */
export function fitText(text: string, most: number): string {
  return Array.from(text.replaceAll(/[\p{Cc}\p{Cf}]/gu, " ").normalize("NFC"))
    .slice(0, most)
    .join("")
    .normalize("NFC");
}

/** What the index says of each page, beside its entry. */
export interface IndexFacts {
  title(page: number): string;
  subpages(page: number): number;
}

/** The index of `entries`, in ascending order; pages past a magazine's bound are left out and reported. */
export function channelIndex(entries: readonly PageEntry[], facts: IndexFacts, limits: Limits, report: (text: string) => void): WireMagazine[] {
  const most = limits.budgets.titleCharacters;
  const byMagazine = new Map<number, PageEntry[]>();
  for (const entry of [...entries].toSorted((one, two) => one.page - two.page)) {
    const magazine = entry.page >> MAGAZINE_SHIFT;
    const pages = byMagazine.get(magazine) ?? [];
    byMagazine.set(magazine, pages);
    pages.push(entry);
  }
  return [...byMagazine.entries()]
    .toSorted(([one], [two]) => one - two)
    .map(([magazine, pages]): WireMagazine => {
      const room = magazine === FIRST_MAGAZINE ? limits.standard.pagesInMagazine1 : limits.standard.pagesPerMagazine;
      if (pages.length > room) {
        report(`magazine ${magazine} has ${pages.length} pages; the index lists its first ${room}`);
      }
      const listed = pages.slice(0, room).map((entry): WireIndexEntry => ({
        page: pageText(entry.page),
        title: fitText(facts.title(entry.page), most),
        section: entry.section === undefined ? null : fitText(entry.section, most),
        subpages: Math.min(Math.max(1, facts.subpages(entry.page)), limits.standard.subpages),
      }));
      const named = pages.find((entry) => entry.section !== undefined)?.section;
      return { magazine, name: fitText(named ?? `Magazine ${magazine}`, most), pages: listed };
    });
}
