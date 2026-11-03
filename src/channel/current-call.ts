// The connection the call being run came from, if any: what a call about a
// session sends goes to it (host.ts), and an answer being made holds back
// every other sending to it until it is sent (DEC-1759).

import type { Connections } from "./connections.ts";

export class CurrentCall {
  /** The connection, or null outside a call from one. */
  connection: number | null = null;

  /** Runs `run` as a call from `connection`. */
  from(connection: number, run: () => void): void {
    this.connection = connection;
    try {
      run();
    } finally {
      this.connection = null;
    }
  }

  /** Runs `answer` for `connection`, held back from every other sending until the answer is sent; a failure is reported. */
  answering(connections: Connections, connection: number, errors: (text: string) => void, answer: () => void): void {
    const state = connections.get(connection);
    if (state === undefined) {
      return;
    }
    state.pending = true;
    state.denied = null;
    try {
      this.from(connection, answer);
    } catch (error) {
      errors(`answering connection ${connection} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    } finally {
      state.pending = false;
    }
  }
}
