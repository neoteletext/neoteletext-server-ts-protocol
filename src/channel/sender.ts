// What the channel sends, to the connections it names (REQ-1473): a kept
// sub-page to those whose selection shows it, one sub-page a message
// (REQ-1501); a page's sub-page list (REQ-1503); the index; and the rest
// to the connections an audience names, in lists of at most `start`'s
// `named_connections`. Nothing goes to a snapshot's connection
// (snapshots.ts): what names it is gathered for its answer or dropped, and
// the message goes to the others it names alone (REQ-6901 item 5).

import { fitText } from "./channel-index.ts";
import type { Connection, Connections } from "./connections.ts";
import type { Change, Copies, Owner } from "./copies.ts";
import type { Copy } from "./copy.ts";
import type { Snapshots } from "./snapshots.ts";
import { ANY_SUB, subText, wirePage } from "./wire-page.ts";
import { pageText } from "../page/page-numbers.ts";
import type { Audience, PictureAudience } from "./audience.ts";
import type { DeniedStatus } from "./connections.ts";
import type { App } from "../wire/app.ts";
import type { Connections as WireConnections, Magazine, PictureAudience as WirePictureAudience, ProgramMessage } from "../wire/generated/protocol.js";

/** The number a redirect carries for a connection this program does not hold, which the server drops: the protocol wants one. */
const NO_CONNECTION_REQUEST = 1;
/** A sub-page's title in its page's list: at most a row's 40 characters (REQ-1503). */
const SUBPAGE_TITLE_CHARACTERS = 40;

/** The connections an audience names one by one: none for a page's viewers or everyone, which no snapshot is among. */
function namedIn(to: Audience): readonly number[] {
  if ("connection" in to) {
    return [to.connection];
  }
  return "connections" in to && to.connections !== "all" ? to.connections : [];
}

/** The channel's sending. */
export class Sender {
  readonly #app: App;
  readonly #connections: Connections;
  readonly #copies: Copies;
  readonly #index: (connection: number) => Magazine[];
  readonly #snapshots: Snapshots;

  constructor(app: App, connections: Connections, copies: Copies, snapshots: Snapshots, index: (connection: number) => Magazine[]) {
    this.#app = app;
    this.#connections = connections;
    this.#copies = copies;
    this.#snapshots = snapshots;
    this.#index = index;
  }

  send(message: ProgramMessage): void {
    this.#app.send(message);
    this.#snapshots.sent(message);
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

  /**
   * The index to every connection answered, or to `only` alone: each the
   * index of the copies it sees, so a connection with its own copy of a page
   * is told that copy's count. Connections whose index is the same are sent
   * it in one message.
   */
  index(only?: number): void {
    if (!this.#app.hasStarted()) {
      return;
    }
    const groups = new Map<string, { magazines: Magazine[]; connections: number[] }>();
    for (const connection of this.#connections.answered()) {
      if (only !== undefined && connection !== only) {
        continue;
      }
      const magazines = this.#index(connection);
      const key = JSON.stringify(magazines);
      const group = groups.get(key) ?? { magazines, connections: [] };
      group.connections.push(connection);
      groups.set(key, group);
    }
    for (const { magazines, connections } of groups.values()) {
      for (const chunk of this.#chunks(connections)) {
        this.send({ type: "index", connections: chunk, magazines });
      }
    }
  }

  /** The number of the connection's selection, which a redirect moves. */
  #request(connection: number): number {
    return this.#connections.get(connection)?.request ?? NO_CONNECTION_REQUEST;
  }

  /** Sends the connection to `page` and `sub`, with a query it keeps: a selection, which the server then tells the program of. */
  redirect(connection: number, page: number, sub: number, query: string | null = null): void {
    if (this.#snapshots.has(connection)) {
      // A redirect is how an application declines a snapshot, as a deny is (REQ-6901 item 4).
      this.#snapshots.decline(connection);
      return;
    }
    this.send({ type: "redirect", connection, request: this.#request(connection), page: pageText(page), sub: subText(sub), query });
  }

  /** Sends the connection's viewer to a page, or to another channel's address, which changes no selection (REQ-1688). */
  redirectTo(connection: number, to: number | string, sub: number): void {
    if (typeof to === "string" && this.#snapshots.has(connection)) {
      this.#snapshots.decline(connection);
    } else if (typeof to === "string") {
      this.send({ type: "redirect", connection, request: this.#request(connection), address: to });
    } else {
      this.redirect(connection, to, sub);
    }
  }

  /** Ends the connection's selection with `status`: as its answer when one is being made, which then holds no page, otherwise at once. */
  deny(connection: number, status: DeniedStatus): void {
    if (this.#snapshots.has(connection)) {
      // Any status: a deny is how an application declines a snapshot (REQ-6901 item 4).
      this.#snapshots.decline(connection);
      return;
    }
    const state = this.#connections.get(connection);
    if (state === undefined) {
      return;
    }
    if (state.pending) {
      state.denied = status;
    } else {
      this.send({ type: "denied", connection, request: state.request, status });
    }
  }

  /** Sends `build`'s message to the connections `to` names, in lists of at most `named_connections`: every line is made and held to the schema before the first is written (typescript.md TS-19). */
  toAudience(to: Audience, build: (connections: WireConnections) => ProgramMessage): void {
    const named = namedIn(to);
    const snapshots = this.#snapshots.among(named);
    if (snapshots.length > 0) {
      // Built once for what it says: its connections are never written (REQ-6901 item 5).
      const message = build(snapshots);
      for (const snapshot of snapshots) {
        this.#snapshots.heard(snapshot, message);
      }
    }
    const others = snapshots.length === 0 ? to : { connections: named.filter((connection) => !snapshots.includes(connection)) };
    const connections = this.#connections.audience(others);
    if (connections === null) {
      return;
    }
    const chunks = connections === "all" ? ["all" as const] : this.#chunks(connections);
    const messages = chunks.map((chunk) => build(chunk));
    this.#app.writeLines(messages.map((message) => this.#app.line(message)));
    for (const message of messages) {
      this.#snapshots.sent(message);
    }
  }

  /**
   * Sends `build`'s message of a sub-page's picture to `to` (renderer parity PAR-16): kept, as one line whatever
   * connections are open, since the server keeps it for later viewers too; otherwise as {@link Sender.toAudience}.
   */
  toPictureAudience(to: PictureAudience, build: (connections: WirePictureAudience) => ProgramMessage): void {
    if ("kept" in to) {
      this.send(build("kept"));
      return;
    }
    this.toAudience(to, build);
  }

  /** Whether the connection sees the owner's copy of `page`: its own, or the channel's when it has none. */
  #sees(state: Connection, owner: Owner, page: number): boolean {
    return owner === "channel" ? this.#copies.get(state.connection, page) === undefined : state.connection === owner;
  }

  /** Sends what a change to the owner's copy of `page` did to every connection whose selection shows that copy; nothing rotates. */
  distribute(owner: Owner, page: number, change: Change): void {
    if (!this.#app.hasStarted()) {
      return;
    }
    const bySub = new Map<number, number[]>();
    const lists: number[] = [];
    for (const [connection, state] of this.#connections.entries()) {
      const copy = this.#copies.seen(state.connection, page);
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
    if (change.countBefore !== change.countAfter) {
      this.index(owner === "channel" ? undefined : owner);
    }
  }

  /** The connection's own copy of `page` went: if it is there it is sent the channel's copy, and its list, and its index, whose count may change with it. */
  released(owner: number, page: number, countBefore: number): void {
    const copy = this.#copies.get("channel", page);
    if (copy?.subpages.size !== countBefore) {
      this.index(owner);
    }
    if (copy === undefined) {
      return;
    }
    for (const [connection, state] of this.#connections.entries()) {
      if (connection === owner && state.page === page && !state.pending) {
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
