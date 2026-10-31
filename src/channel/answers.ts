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
import { clicked, type Input } from "../input/input.ts";
import { clickedLink, type PageView } from "../navigation/clicked-link.ts";
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

/**
 * The reply to `connected`: the index and the sub-page `sub` of `page`
 * selects, then the page's list. `asked` is the page the server holds as the
 * connection's selection, if any.
 *
 * The server refuses a reply whose page its index does not list, and shows a
 * connection only its selection, so a viewer still gets a page when the reply
 * cannot carry it (DEC-1543 item 2): the reply goes with none, then the
 * sub-page goes on its own, or the page is moved to, whose first sub-page then
 * answers.
 */
export function answerConnected(
  parts: AnswerParts,
  connection: number,
  state: Connection,
  page: number | undefined,
  sub: number,
  asked: number | undefined,
): void {
  const copy = page === undefined ? undefined : parts.copies.seen(state.session, page);
  const shown = resolve(copy, sub);
  state.sub = shown ?? null;
  const magazines = parts.index();
  if (page === undefined || copy === undefined) {
    parts.sender.send({ type: "reply", connection, magazines, selected: null });
    parts.errors(`connection ${connection}: no application has published ${page === undefined ? "a page" : pageText(page)}`);
    return;
  }
  const text = pageText(page);
  const listed = magazines.some((magazine) => magazine.pages.some((entry) => entry.page === text));
  const holds = asked === undefined || asked === page;
  if (shown !== undefined && listed && holds) {
    parts.sender.send({ type: "reply", connection, magazines, selected: wirePage(page, shown, copy) });
    parts.sender.list([connection], page, copy);
    return;
  }
  parts.sender.send({ type: "reply", connection, magazines, selected: null });
  if (shown !== undefined && asked === page) {
    parts.sender.page([connection], page, shown, copy);
    parts.sender.list([connection], page, copy);
  } else {
    state.sub = null;
    parts.sender.goto(connection, page, ANY_SUB);
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

/** A click the page did not take: the Fastext prompt or the page number it is on is followed. */
export function followClick(sender: Sender, connection: number, input: Input, view: PageView): void {
  if (clicked(input) && input.kind === "mouse") {
    const link = clickedLink(view, input.column, input.row);
    if (link !== null) {
      sender.goto(connection, link, ANY_SUB);
    }
  }
}

/** What the connection sees of `page`: the rows and the Fastext links of `sub`, or for 3F7F of the sub-page it was sent. */
export function viewOf(copies: Copies, state: Connection, page: number, sub: number): PageView {
  const copy = copies.seen(state.session, page);
  const shown = sub === ANY_SUB ? (state.sub ?? copy?.first()) : sub;
  const content = shown === undefined ? undefined : copy?.subpages.get(shown)?.content;
  if (content === undefined) {
    return { rows: [], links: [null, null, null, null] };
  }
  const [red = null, green = null, yellow = null, cyan = null] = content.links
    .slice(0, FASTEXT_KEYS)
    .map((link) => (link === null ? null : Number.parseInt(link.page, PAGE_RADIX)));
  return { rows: rowsOf(content), links: [red, green, yellow, cyan] };
}
