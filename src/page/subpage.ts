// A publication's sub-pages, and all of them as one TTI text (for files).

import type { SubPageContent } from "./content.ts";
import { Screen } from "./screen.ts";

/** What a sub-page shows: a screen drawn, or content made otherwise, such as read from TTI (readTtiPages) with text of its own. */
export type SubpageBody = { readonly screen: Screen } | { readonly content: SubPageContent };

/**
 * One sub-page of a publication: what it shows; for a put, its sub-code (a
 * whole page's sub-pages need none: the kit numbers them by place); and its
 * title in the page's sub-page list, at most 40 characters (REQ-1503).
 */
export type Subpage = SubpageBody & {
  readonly subcode?: number;
  readonly title?: string;
};

/** The protocol's content of a sub-page. */
export function contentOf(subpage: SubpageBody): SubPageContent {
  return "screen" in subpage ? subpage.screen.content() : subpage.content;
}

/** Screens of page `page` as one TTI text, each from its PN line, with its SC line when it has a sub-code; a screen with text for the server to encode has no TTI (Screen.toTti). */
export function tti(page: number, subpages: readonly { readonly screen: Screen; readonly subcode?: number }[]): string {
  return subpages.map(({ screen, subcode }) => screen.toTti(page, subcode)).join("");
}
