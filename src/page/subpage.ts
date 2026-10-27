// A publication's sub-pages, and all of them as one TTI text.

import { Screen } from "./screen.ts";

/** One sub-page of a publication: the screen and its number. */
export interface Subpage {
  readonly screen: Screen;
  readonly subpage: number;
}

/** Sub-pages of page `page` as one TTI text, each from its PN line. */
export function tti(page: number, subpages: readonly Subpage[]): string {
  return subpages.map(({ screen, subpage }) => screen.toTti(page, subpage)).join("");
}
