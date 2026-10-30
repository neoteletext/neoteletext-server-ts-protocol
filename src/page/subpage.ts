// A publication's sub-pages, and all of them as one TTI text (for files).

import { Screen } from "./screen.ts";

/**
 * One sub-page of a publication: the screen; for a put, its sub-code (a
 * whole page's sub-pages need none: the kit numbers them by place); and its
 * title in the page's sub-page list, at most 40 characters (REQ-1503).
 */
export interface Subpage {
  readonly screen: Screen;
  readonly subcode?: number;
  readonly title?: string;
}

/** Sub-pages of page `page` as one TTI text, each from its PN line, with its SC line when it has a sub-code. */
export function tti(page: number, subpages: readonly Subpage[]): string {
  return subpages.map(({ screen, subcode }) => screen.toTti(page, subcode)).join("");
}
