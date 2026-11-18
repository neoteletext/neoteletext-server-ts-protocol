// A program's measures of its pages (REQ-2216): each `measure` goes with a
// number of the program's, and the server's `measured`, or its `refused`
// naming that number, settles the promise the program holds.

import type { SubPageContent } from "../page/content.ts";
import { pageText } from "../page/page-numbers.ts";
import type { App } from "../wire/app.ts";
import type { ServerMessageMeasured, ServerMessageRefused } from "../wire/generated/protocol.js";
import { MeasureRefusedError } from "./measure-refused.ts";
import { subText } from "./wire-page.ts";

/** A measure's number is an unsigned 32-bit integer (the schema's measure.request): they go round. */
const REQUEST_NUMBERS = 2 ** 32;
/** The sub-code a measured page is sent with: it is sent to no viewer, so any sub-page will do. */
const MEASURED_SUB = 0;

interface Waiting {
  readonly resolve: (measured: ServerMessageMeasured) => void;
  readonly reject: (error: Error) => void;
}

/** The measures sent and not yet answered, by their numbers. */
export class Measures {
  readonly #waiting = new Map<number, Waiting>();
  #next = 0;

  /** Sends `measure` for `content` as page `page`, resolving to the server's `measured`, or rejecting with its refusal. */
  ask(app: App, page: number, content: SubPageContent): Promise<ServerMessageMeasured> {
    const request = this.#next;
    this.#next = (this.#next + 1) % REQUEST_NUMBERS;
    return new Promise((resolve, reject) => {
      // A number still waiting after going round is answered by neither: its asker is told now.
      this.#waiting.get(request)?.reject(new Error(`measure ${request}: unanswered after ${REQUEST_NUMBERS} more measures`));
      this.#waiting.set(request, { resolve, reject });
      try {
        app.send({ type: "measure", request, page: { page: pageText(page), sub: subText(MEASURED_SUB), ...content } });
      } catch (error) {
        this.#waiting.delete(request);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** The server's answer to measure `request`; false when no measure of that number waits. */
  answered(request: number, measured: ServerMessageMeasured): boolean {
    const waiting = this.#waiting.get(request);
    this.#waiting.delete(request);
    waiting?.resolve(measured);
    return waiting !== undefined;
  }

  /** A refusal: the measure it names is rejected with it, and true; false for a refusal of anything else. */
  refused(refusal: ServerMessageRefused): boolean {
    if (refusal.message !== "measure" || refusal.request === null || refusal.request === undefined) {
      return false;
    }
    const waiting = this.#waiting.get(refusal.request);
    this.#waiting.delete(refusal.request);
    waiting?.reject(new MeasureRefusedError(refusal));
    return waiting !== undefined;
  }

  /** The server started again: no measure sent before will be answered. */
  forgetAll(): void {
    for (const [request, waiting] of this.#waiting) {
      waiting.reject(new Error(`measure ${request}: the server started again before answering`));
    }
    this.#waiting.clear();
  }
}
