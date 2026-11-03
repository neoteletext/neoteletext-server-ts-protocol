// What a measure the server refuses rejects with (REQ-2216 item 4).

import type { Refusal } from "../wire/server-message.ts";

/** The server refused a page the program measured: the page would be refused the same way when sent. */
export class MeasureRefusedError extends Error {
  readonly refusal: Refusal;

  constructor(refusal: Refusal) {
    super(`the server refused the page measured: ${refusal.path === "" ? "the message" : refusal.path}: ${refusal.rule} (${refusal.detail})`);
    this.name = "MeasureRefusedError";
    this.refusal = refusal;
  }
}
