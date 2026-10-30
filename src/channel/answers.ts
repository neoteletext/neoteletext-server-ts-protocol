// The channel's answers to the server's two questions (DEC-1482 item 1):
// `connected` with one `reply` holding the index and the one sub-page the
// connection shows (REQ-1471), and `selected` with exactly one sub-page
// (REQ-1472, REQ-1501), for 3F7F the page's first in ascending order
// (DEC-1526, REQ-1502); each with the page's sub-page list when it has
// several (REQ-1503). And what a connection sees of a page, to follow a
// click or a coloured key.

import type { Connection } from "./connections.ts";
import type { Copies } from "./copies.ts";
import type { Copy } from "./copy.ts";
import type { Sender } from "./sender.ts";
import { ANY_SUB, wirePage } from "./wire-page.ts";
import type { PageView } from "../navigation/clicked-link.ts";
import { rowsOf } from "../page/content.ts";
import { PAGE_RADIX, pageText } from "../page/page-numbers.ts";
import type { WireMagazine } from "../wire/protocol.ts";

/** The four Fastext links of X/27/0's six (EN 300 706 clause 9.6). */
const FASTEXT_KEYS = 4;

/** What an answer is made from. */
export interface AnswerParts {
  readonly copies: Copies;
  readonly sender: Sender;
  readonly index: () => WireMagazine[];
  readonly errors: (text: string) => void;
}

/** The sub-page a selection of `sub` shows: that one, or for 3F7F the first in ascending order (DEC-1526). */
function resolve(copy: Copy | undefined, sub: number): number | undefined {
  if (copy === undefined) {
    return undefined;
  }
  if (sub === ANY_SUB) {
    return copy.first();
  }
  return copy.subpages.has(sub) ? sub : undefined;
}

/** The reply to `connected`: the index, and the sub-page `sub` of `page` selects, or none; then the page's list. */
export function answerConnected(parts: AnswerParts, connection: number, state: Connection, page: number | undefined, sub: number): void {
  const copy = page === undefined ? undefined : parts.copies.seen(state.session, page);
  const shown = resolve(copy, sub);
  state.sub = shown ?? null;
  const selected = page === undefined || shown === undefined || copy === undefined ? null : wirePage(page, shown, copy);
  parts.sender.send({ type: "reply", connection, magazines: parts.index(), selected });
  if (selected !== null && page !== undefined && copy !== undefined) {
    parts.sender.list([connection], page, copy);
  }
}

/** The answer to `selected`: one sub-page, and the page's list for a page selection or a page newly selected. */
export function answerSelected(parts: AnswerParts, connection: number, state: Connection, page: number, sub: number, newPage: boolean): void {
  const copy = parts.copies.seen(state.session, page);
  const shown = resolve(copy, sub);
  state.sub = shown ?? null;
  if (copy === undefined) {
    parts.errors(`selected ${pageText(page)}: no application has published it`);
  } else if (shown === undefined) {
    // A sub-page the page does not have: the page instead, whose first sub-page then answers.
    parts.sender.goto(connection, page, ANY_SUB);
  } else {
    parts.sender.page([connection], page, shown, copy);
    if (sub === ANY_SUB || newPage) {
      parts.sender.list([connection], page, copy);
    }
  }
}

/** What the connection sees of `page`: the rows and the Fastext links of the sub-page it was sent. */
export function viewOf(copies: Copies, state: Connection, page: number): PageView {
  const copy = copies.seen(state.session, page);
  const sub = state.sub ?? copy?.first();
  const content = sub === undefined ? undefined : copy?.subpages.get(sub)?.content;
  if (content === undefined) {
    return { rows: [], links: [null, null, null, null] };
  }
  const [red = null, green = null, yellow = null, cyan = null] = content.links
    .slice(0, FASTEXT_KEYS)
    .map((link) => (link === null ? null : Number.parseInt(link.page, PAGE_RADIX)));
  return { rows: rowsOf(content), links: [red, green, yellow, cyan] };
}
