// A publication's sub-pages, and all of them as one TTI text.

import { Screen } from "./screen.ts";

/**
 * One sub-page of a publication: the screen, and for a put its sub-code
 * (docs/applications.md section 3.2). A whole page's sub-pages need none:
 * the server numbers them by place.
 */
export interface Subpage {
  readonly screen: Screen;
  readonly subcode?: number;
}

/** Sub-pages of page `page` as one TTI text, each from its PN line, with its SC line when it has a sub-code. */
export function tti(page: number, subpages: readonly Subpage[]): string {
  return subpages.map(({ screen, subcode }) => screen.toTti(page, subcode)).join("");
}
