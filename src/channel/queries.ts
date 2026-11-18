// A program's queries of a page's local state in one viewer's receiver
// (page-rules.md RULE-38): each `query_state` goes with a number of the
// program's, and the server's `page_state`, or its `refused` naming that
// number, settles the promise the program holds.

import { subText } from "./wire-page.ts";
import { pageText } from "../page/page-numbers.ts";
import type { App } from "../wire/app.ts";
import type { ServerMessagePageState } from "../wire/generated/protocol.js";
import { QueryRefusedError } from "./query-refused.ts";
import { Requests } from "./requests.ts";

/** A query's first number: the schema's `query_state.request` is 1 to 4,294,967,295 (RULE-38). */
const FIRST_REQUEST = 1;
/** A query's last number. */
const LAST_REQUEST = 2 ** 32 - 1;

/** The queries sent and not yet answered, by their numbers. */
export class Queries extends Requests<ServerMessagePageState> {
  constructor() {
    super({ message: "query_state", called: "state query", first: FIRST_REQUEST, last: LAST_REQUEST, refusedAs: (refusal) => new QueryRefusedError(refusal) });
  }

  /** Sends `query_state` for sub-page `sub` of `page` on `connection`, resolving to the server's `page_state`, or rejecting with its refusal. */
  query(app: App, connection: number, page: number, sub: number): Promise<ServerMessagePageState> {
    return this.ask((request) => {
      app.send({ type: "query_state", connection, page: pageText(page), sub: subText(sub), request });
    });
  }
}
