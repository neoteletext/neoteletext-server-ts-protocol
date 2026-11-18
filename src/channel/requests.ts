// A program's questions of the server that carry a number of its own: a
// page measured (REQ-2216), a page's local state queried (page-rules.md
// RULE-38) and picture text measured (renderer parity PAR-22). Each goes
// with its number, and the server's answer, or its `refused` naming that
// message and number, settles the promise the program holds.

import type { MessageType, ServerMessageRefused } from "../wire/generated/protocol.js";

interface Waiting<Answer> {
  readonly resolve: (answer: Answer) => void;
  readonly reject: (error: Error) => void;
}

/** What one kind of question is: its message, its numbers and what a refusal of it rejects with. */
export interface Asked {
  /** The message asked with, as a refusal names it. */
  readonly message: MessageType;
  /** What an error calls one, as "measure" or "state query". */
  readonly called: string;
  /** Its first number and its last, which the numbers go round within. */
  readonly first: number;
  readonly last: number;
  /** The error a refusal of it rejects with. */
  readonly refusedAs: (refusal: ServerMessageRefused) => Error;
}

/** The questions of one kind sent and not yet answered, by their numbers. */
export class Requests<Answer> {
  readonly #asked: Asked;
  readonly #waiting = new Map<number, Waiting<Answer>>();
  #next: number;

  constructor(asked: Asked) {
    this.#asked = asked;
    this.#next = asked.first;
  }

  /** Sends the question `send` writes with the next number, resolving to the server's answer or rejecting with its refusal, or with what `send` threw. */
  ask(send: (request: number) => void): Promise<Answer> {
    const { called, first, last } = this.#asked;
    const request = this.#next;
    this.#next = request === last ? first : request + 1;
    return new Promise((resolve, reject) => {
      // A number still waiting after going round is answered by neither: its asker is told now.
      this.#waiting.get(request)?.reject(new Error(`${called} ${request}: unanswered after ${last - first + 1} more`));
      this.#waiting.set(request, { resolve, reject });
      try {
        send(request);
      } catch (error) {
        this.#waiting.delete(request);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** The server's answer to question `request`; false when none of that number waits. */
  answered(request: number, answer: Answer): boolean {
    const waiting = this.#waiting.get(request);
    this.#waiting.delete(request);
    waiting?.resolve(answer);
    return waiting !== undefined;
  }

  /** A refusal: the question it names is rejected with it, and true; false for a refusal of anything else. */
  refused(refusal: ServerMessageRefused): boolean {
    if (refusal.message !== this.#asked.message || refusal.request === null || refusal.request === undefined) {
      return false;
    }
    const waiting = this.#waiting.get(refusal.request);
    this.#waiting.delete(refusal.request);
    waiting?.reject(this.#asked.refusedAs(refusal));
    return waiting !== undefined;
  }

  /** The server started again: no question sent before will be answered. */
  forgetAll(): void {
    for (const [request, waiting] of this.#waiting) {
      waiting.reject(new Error(`${this.#asked.called} ${request}: the server started again before answering`));
    }
    this.#waiting.clear();
  }
}
