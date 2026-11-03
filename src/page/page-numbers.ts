// Page numbers: magazine 1 to 8 and two hexadecimal digits, written as the
// protocol and TTI write them.

/** The page every channel has, where a number outside the channel falls back to. */
export const FIRST_PAGE = 0x100;

/** The last page number a channel may have: magazine 8, page FF (EN 300 706 clause 3.1). */
export const LAST_PAGE = 0x8ff;

/** Digits in a page number: its magazine, then two of its page. */
export const PAGE_DIGITS = 3;

/** Page numbers are written in hexadecimal; the digits a viewer types are its decimal ones. */
export const PAGE_RADIX = 16;

/** A page number written as the protocol and TTI write it: three hexadecimal digits, "1A0". */
export function pageText(page: number): string {
  return page.toString(16).toUpperCase().padStart(3, "0");
}

/** Whether `page` is a page number a channel may have: magazine 1 to 8 (EN 300 706 clause 3.1). */
export function isPageNumber(page: number): boolean {
  return Number.isInteger(page) && page >= FIRST_PAGE && page <= LAST_PAGE;
}

/** A page number's two digits within its magazine. */
const PAGE_IN_MAGAZINE = 0xff;
/** The pages no magazine carries: mFD, mFE and mFF, and 1BE and 1F0 (EN 300 706 Annex A.10; the engine's limits::RESERVED_IN_EVERY_MAGAZINE and RESERVED_PAGES). */
const RESERVED_IN_EVERY_MAGAZINE: ReadonlySet<number> = new Set([0xfd, 0xfe, 0xff]);
const RESERVED_PAGES: ReadonlySet<number> = new Set([0x1be, 0x1f0]);

/** Whether the standard reserves `page`, so no index lists it and no message carries it. */
export function isReserved(page: number): boolean {
  return RESERVED_IN_EVERY_MAGAZINE.has(page & PAGE_IN_MAGAZINE) || RESERVED_PAGES.has(page);
}
