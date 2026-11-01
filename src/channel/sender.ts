// What the channel sends, to the connections it names (REQ-1473): a kept
// sub-page to those whose selection shows it, one sub-page a message
// (REQ-1501); a page's sub-page list (REQ-1503); the index; and the rest
// to the connections an audience names, in lists of at most `start`'s
// `named_connections`.

import { fitText } from "./channel-index.ts";
import type { Connection, Connections } from "./connections.ts";
import type { Change, Copies, Owner } from "./copies.ts";
import type { Copy } from "./copy.ts";
import { ANY_SUB, subText, wirePage } from "./wire-page.ts";
import { pageText } from "../page/page-numbers.ts";
import type { Audience } from "../sound/members.ts";
import type { App } from "../wire/app.ts";
import type { ProgramMessage, WireConnections, WireMagazine } from "../wire/protocol.ts";

/** The number a redirect carries for a connection this program does not hold, which the server drops: the protocol wants one. */
const NO_CONNECTION_REQUEST = 1;
/** A sub-page's title in its page's list: at most a row's 40 characters (REQ-1503). */
const SUBPAGE_TITLE_CHARACTERS = 40;

/** The channel's sending. */
export class Sender {
  readonly #app: App;
  readonly #connections: Connections;
  readonly #copies: Copies;
  readonly #index: () => WireMagazine[];

  constructor(app: App, connections: Connections, copies: Copies, index: () => WireMagazine[]) {
    this.#app = app;
    this.#connections = connections;
    this.#copies = copies;
    this.#index = index;
  }

  send(message: ProgramMessage): void {
    this.#app.send(message);
  }

  /** `connections` in lists of at most `start`'s `named_connections`. */
  #chunks(connections: readonly number[]): number[][] {
    const most = this.#app.limits().budgets.namedConnections;
    const chunks: number[][] = [];
    for (let at = 0; at < connections.length; at += most) {
      chunks.push(connections.slice(at, at + most));
    }
    return chunks;
  }

  /** Sub-page `sub` of the copy to `connections`; `request` is the one selection it answers, none for a change. */
  page(connections: readonly number[], page: number, sub: number, copy: Copy, request: number | null = null): void {
    for (const chunk of this.#chunks(connections)) {
      this.send({ type: "page", connections: chunk, request, page: wirePage(page, sub, copy) });
    }
  }

  /** The page's sub-page list to `connections`, when the page has more than one sub-page or `always` (REQ-1503); `request` as for a sub-page. */
  list(connections: readonly number[], page: number, copy: Copy, always = false, request: number | null = null): void {
    if (connections.length === 0 || copy.subpages.size === 0 || (copy.subpages.size < 2 && !always)) {
      return;
    }
    const subpages = copy.subs().map((sub) => {
      const title = copy.subpages.get(sub)?.title ?? null;
      return { sub: subText(sub), title: title === null ? null : fitText(title, SUBPAGE_TITLE_CHARACTERS) };
    });
    for (const chunk of this.#chunks(connections)) {
      this.send({ type: "subpages", connections: chunk, request, page: pageText(page), version: copy.version, subpages });
    }
  }

  /** The index to every connection answered. */
  index(): void {
    const answered = this.#connections.answered();
    if (answered.length === 0 || !this.#app.hasStarted()) {
      return;
    }
    const magazines = this.#index();
    for (const chunk of this.#chunks(answered)) {
      this.send({ type: "index", connections: chunk, magazines });
    }
  }

  /** The number of the connection's selection, which a redirect moves. */
  #request(connection: number): number {
    return this.#connections.get(connection)?.request ?? NO_CONNECTION_REQUEST;
  }

  /** Sends the connection to `page` and `sub`, with a query it keeps: a selection, which the server then tells the program of. */
  redirect(connection: number, page: number, sub: number, query: string | null = null): void {
    this.send({ type: "redirect", connection, request: this.#request(connection), page: pageText(page), sub: subText(sub), query });
  }

  /** Sends the connection's viewer to a page, or to another channel's address, which changes no selection (REQ-1688). */
  redirectTo(connection: number, to: number | string, sub: number): void {
    if (typeof to === "string") {
      this.send({ type: "redirect", connection, request: this.#request(connection), address: to });
    } else {
      this.redirect(connection, to, sub);
    }
  }

  /** Sends `build`'s message to the connections `to` names. */
  toAudience(to: Audience, build: (connections: WireConnections) => ProgramMessage): void {
    const connections = this.#connections.audience(to);
    if (connections === null) {
      return;
    }
    for (const chunk of connections === "all" ? ["all" as const] : this.#chunks(connections)) {
      this.send(build(chunk));
    }
  }

  /** Whether the connection sees the owner's copy of `page`: its session's own, or the channel's when it has none. */
  #sees(state: Connection, owner: Owner, page: number): boolean {
    return owner === "channel" ? this.#copies.get(state.session, page) === undefined : state.session === owner;
  }

  /** Sends what a change to the owner's copy of `page` did to every connection whose selection shows that copy; nothing rotates. */
  distribute(owner: Owner, page: number, change: Change): void {
    if (!this.#app.hasStarted()) {
      return;
    }
    const bySub = new Map<number, number[]>();
    const lists: number[] = [];
    for (const [connection, state] of this.#connections.entries()) {
      const copy = this.#copies.seen(state.session, page);
      if (state.pending || state.page !== page || !this.#sees(state, owner, page) || copy === undefined) {
        continue;
      }
      if (state.sub === null || !copy.subpages.has(state.sub)) {
        // What it showed went: the page again, whose first sub-page then answers.
        state.sub = null;
        this.redirect(connection, page, ANY_SUB);
        continue;
      }
      if (change.changed.has(state.sub)) {
        bySub.set(state.sub, [...(bySub.get(state.sub) ?? []), connection]);
      }
      if (change.listChanged && (change.countBefore > 1 || change.countAfter > 1)) {
        lists.push(connection);
      }
    }
    const copy = this.#copies.get(owner, page);
    if (copy !== undefined) {
      for (const [sub, connections] of bySub) {
        this.page(connections, page, sub, copy);
      }
      this.list(lists, page, copy, true);
    }
    if (owner === "channel" && change.countBefore !== change.countAfter) {
      this.index();
    }
  }

  /** The session's own copy of `page` went: each of its connections there is sent the channel's copy, and its list. */
  released(session: number, page: number): void {
    const copy = this.#copies.get("channel", page);
    if (copy === undefined) {
      return;
    }
    for (const [connection, state] of this.#connections.entries()) {
      if (state.session === session && state.page === page && !state.pending) {
        const sub = state.sub !== null && copy.subpages.has(state.sub) ? state.sub : copy.first();
        if (sub !== undefined) {
          state.sub = sub;
          this.page([connection], page, sub, copy);
          this.list([connection], page, copy);
        }
      }
    }
  }
}
