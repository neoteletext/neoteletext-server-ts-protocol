// What a viewer sees of a page, kept to follow their clicks.

import type { PageView } from "../navigation/clicked-link.ts";
import { NO_LINKS } from "../page/fastext.ts";
import { ROWS } from "../page/geometry.ts";
import { Screen } from "../page/screen.ts";

/** A page not yet published: nothing to click on, no links. */
export const NO_VIEW: PageView = { rows: [], links: NO_LINKS };

/** What a viewer sees of `screen`, kept apart from it, since an application may draw on it again. */
export function viewOf(screen: Screen): PageView {
  return { rows: Array.from({ length: ROWS }, (_, row) => [...(screen.row(row) ?? [])]), links: screen.fastextLinks() };
}
