// The connections open to the channel: one a browser tab, each its own unit
// to applications (DEC-6443; viewer-state.md VS-403), with its viewer, its
// one selection (DEC-1527), and what it was last sent.

import type { Audience } from "./audience.ts";
import type { Viewer } from "./viewer.ts";
import type { Connections as WireConnections, ProgramMessageDenied } from "../wire/generated/protocol.js";

/** What DENIED carries (DOC-1961): 403 not allowed, 404 no such page, 429 a limit, 503 not answering. */
export type DeniedStatus = ProgramMessageDenied["status"];

/** One browser tab showing the channel: its viewer, the page its selection is on and the sub-page it was sent. */
export interface Connection {
  /** Its number, which owns its own copies of pages. */
  readonly connection: number;
  /** Its viewer, or null for none (VS-351 item 1). */
  viewer: Viewer | null;
  /** The viewer chose to be remembered on this channel; false with no viewer. */
  remembered: boolean;
  page: number | null;
  sub: number | null;
  /** The number of its selection, which what answers it carries back (DEC-1759 lesson 13). */
  request: number;
  /** The query of its selection (DEC-1730). */
  query: string | null;
  /** Its page's application has been told of a request of its selection, and is to be told when it ends. */
  requested: boolean;
  /** Its answer is being made: nothing else goes to it until that is sent. */
  pending: boolean;
  /** An application denied the selection being answered: the answer is this status, not a page. */
  denied: DeniedStatus | null;
}

/** Every connection open, by its number. */
export class Connections {
  readonly #open = new Map<number, Connection>();

  get(connection: number): Connection | undefined {
    return this.#open.get(connection);
  }

  add(connection: number, request: number, viewer: Viewer | null, remembered: boolean): Connection {
    const state: Connection = {
      connection,
      viewer,
      remembered: viewer !== null && remembered,
      page: null,
      sub: null,
      request,
      query: null,
      requested: false,
      pending: true,
      denied: null,
    };
    this.#open.set(connection, state);
    return state;
  }

  /** Forgets every connection: a program started again is told each again. */
  clear(): void {
    this.#open.clear();
  }

  /** Forgets the connection; whether it was open. */
  forget(connection: number): boolean {
    return this.#open.delete(connection);
  }

  entries(): IterableIterator<[number, Connection]> {
    return this.#open.entries();
  }

  get size(): number {
    return this.#open.size;
  }

  /** The connections answered, which a change may be sent to. */
  answered(): number[] {
    return [...this.#open].filter(([, state]) => !state.pending).map(([connection]) => connection);
  }

  /** The connections `to` names, open now; null for none. */
  audience(to: Audience): WireConnections | null {
    let named: number[];
    if ("connections" in to) {
      if (to.connections === "all") {
        return this.#open.size === 0 ? null : "all";
      }
      named = [...to.connections];
    } else if ("connection" in to) {
      named = this.#open.has(to.connection) ? [to.connection] : [];
    } else {
      named = [...this.#open].filter(([, state]) => state.page === to.page).map(([connection]) => connection);
    }
    return named.length === 0 ? null : named;
  }
}
