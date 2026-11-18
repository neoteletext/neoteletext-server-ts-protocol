// A program's queries of a page's local state in one viewer's receiver
// (page-rules.md RULE-38): each `query_state` goes with a number of the
// program's, and the server's `page_state`, or its `refused` naming that
// number, settles the promise the program holds.

import { pageText } from "../page/page-numbers.ts";
import type { App } from "../wire/app.ts";
import type { ServerMessagePageState, ServerMessageRefused } from "../wire/generated/protocol.js";
import { QueryRefusedError } from "./query-refused.ts";

/** A query's first number: the schema's `query_state.request` is 1 to 4,294,967,295 (RULE-38). */
const FIRST_REQUEST = 1;
/** A query's last number. */
const LAST_REQUEST = 2 ** 32 - 1;

interface Waiting {
  readonly resolve: (state: ServerMessagePageState) => void;
  readonly reject: (error: Error) => void;
}

/** The queries sent and not yet answered, by their numbers. */
export class Queries {
  readonly #waiting = new Map<number, Waiting>();
  #next = FIRST_REQUEST;

  /** Sends `query_state` for `page` on `connection`, resolving to the server's `page_state`, or rejecting with its refusal. */
  ask(app: App, connection: number, page: number): Promise<ServerMessagePageState> {
    const request = this.#next;
    this.#next = request === LAST_REQUEST ? FIRST_REQUEST : request + 1;
    return new Promise((resolve, reject) => {
      // A number still waiting after going round is answered by neither: its asker is told now.
      this.#waiting.get(request)?.reject(new Error(`state query ${request}: unanswered after ${LAST_REQUEST} more queries`));
      this.#waiting.set(request, { resolve, reject });
      try {
        app.send({ type: "query_state", connection, page: pageText(page), request });
      } catch (error) {
        this.#waiting.delete(request);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** The server's answer to a query; false when no query of its number waits. */
  answered(state: ServerMessagePageState): boolean {
    const waiting = this.#waiting.get(state.request);
    this.#waiting.delete(state.request);
    waiting?.resolve(state);
    return waiting !== undefined;
  }

  /** A refusal: the query it names is rejected with it, and true; false for a refusal of anything else. */
  refused(refusal: ServerMessageRefused): boolean {
    if (refusal.message !== "query_state" || refusal.request === null || refusal.request === undefined) {
      return false;
    }
    const waiting = this.#waiting.get(refusal.request);
    this.#waiting.delete(refusal.request);
    waiting?.reject(new QueryRefusedError(refusal));
    return waiting !== undefined;
  }

  /** The server started again: no query sent before will be answered. */
  forgetAll(): void {
    for (const [request, waiting] of this.#waiting) {
      waiting.reject(new Error(`state query ${request}: the server started again before answering`));
    }
    this.#waiting.clear();
  }
}
