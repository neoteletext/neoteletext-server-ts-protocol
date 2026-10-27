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
