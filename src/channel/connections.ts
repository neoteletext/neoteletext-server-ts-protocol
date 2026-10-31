// The connections open to the channel: one a browser tab, each with its
// session and its one selection (DEC-1527), and what it was last sent.

import type { Audience } from "../sound/members.ts";
import type { WireConnections } from "../wire/protocol.ts";

/** One browser tab showing the channel: its session, the page its selection is on and the sub-page it was sent. */
export interface Connection {
  readonly session: number;
  page: number | null;
  sub: number | null;
  /** The page parameters of its selection (REQ-1693 item 6). */
  parameters: string | null;
  /** Its answer is being made: nothing else goes to it until that is sent. */
  pending: boolean;
}

/** Every connection open, by its number. */
export class Connections {
  readonly #open = new Map<number, Connection>();

  get(connection: number): Connection | undefined {
    return this.#open.get(connection);
  }

  add(connection: number, session: number): Connection {
    const state: Connection = { session, page: null, sub: null, parameters: null, pending: true };
    this.#open.set(connection, state);
    return state;
  }

  /** Forgets every connection: a program started again is told each again. */
  clear(): void {
    this.#open.clear();
  }

  /** Forgets the session's connections, and says which they were. */
  forgetSession(session: number): number[] {
    const gone = this.ofSession(session);
    for (const connection of gone) {
      this.#open.delete(connection);
    }
    return gone;
  }

  entries(): IterableIterator<[number, Connection]> {
    return this.#open.entries();
  }

  get size(): number {
    return this.#open.size;
  }

  /** The connections of `session`. */
  ofSession(session: number): number[] {
    return [...this.#open].filter(([, state]) => state.session === session).map(([connection]) => connection);
  }

  /** The connections answered, which a change may be sent to. */
  answered(): number[] {
    return [...this.#open].filter(([, state]) => !state.pending).map(([connection]) => connection);
  }

  /** Whether another connection of the session has its selection on `page`. */
  otherOn(connection: number, session: number, page: number): boolean {
    return [...this.#open].some(([other, state]) => other !== connection && state.session === session && state.page === page);
  }

  /** The connections `to` names, open now; null for none. */
  audience(to: Audience): WireConnections | null {
    let named: number[];
    if ("connections" in to) {
      if (to.connections === "all") {
        return this.#open.size === 0 ? null : "all";
      }
      named = [...to.connections];
    } else if ("session" in to) {
      named = this.ofSession(to.session);
    } else {
      named = [...this.#open].filter(([, state]) => state.page === to.page).map(([connection]) => connection);
    }
    return named.length === 0 ? null : named;
  }
}
