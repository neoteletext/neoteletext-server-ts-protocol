// Each server session's tabs. Tabs are independent (DEC-6443): every
// connection is a session of its own to applications, numbered as the
// connection, and the server's session, which a browser's tabs share
// through its cookie, only says when they all end.

/** The tabs of each server session. */
export class Tabs {
  readonly #of = new Map<number, Set<number>>();

  /** `connection` is a tab of the server's `session`. */
  add(session: number, connection: number): void {
    const tabs = this.#of.get(session) ?? new Set<number>();
    tabs.add(connection);
    this.#of.set(session, tabs);
  }

  /** The tabs of `session`, which has ended, forgotten. */
  take(session: number): number[] {
    const tabs = [...(this.#of.get(session) ?? [])];
    this.#of.delete(session);
    return tabs;
  }

  clear(): void {
    this.#of.clear();
  }
}
