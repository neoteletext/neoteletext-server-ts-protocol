// What a state query the server refuses rejects with (page-rules.md RULE-38,
// RULE-39).

import type { ServerMessageRefused } from "../wire/generated/protocol.js";

/** The server refused a state query, or no answer came (`wrong_page`, `too_frequent`, `not_answered`): the page's state is not known, which is never an empty state (RULE-38). */
export class QueryRefusedError extends Error {
  readonly refusal: ServerMessageRefused;

  constructor(refusal: ServerMessageRefused) {
    super(`the server refused the state query: ${refusal.path === "" ? "the message" : refusal.path}: ${refusal.rule} (${refusal.detail})`);
    this.name = "QueryRefusedError";
    this.refusal = refusal;
  }
}
