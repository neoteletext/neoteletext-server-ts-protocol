// A program's measures of its pages (REQ-2216): each `measure` goes with a
// number of the program's, and the server's `measured`, or its `refused`
// naming that number, settles the promise the program holds.

import type { SubPageContent } from "../page/content.ts";
import { pageText } from "../page/page-numbers.ts";
import type { App } from "../wire/app.ts";
import type { ServerMessageMeasured } from "../wire/generated/protocol.js";
import { MeasureRefusedError } from "./measure-refused.ts";
import { Requests } from "./requests.ts";
import { subText } from "./wire-page.ts";

/** A measure's numbers are the unsigned 32-bit integers (the schema's measure.request): they go round. */
const LAST_REQUEST = 2 ** 32 - 1;
/** The sub-code a measured page is sent with: it is sent to no viewer, so any sub-page will do. */
const MEASURED_SUB = 0;

/** The measures sent and not yet answered, by their numbers. */
export class Measures extends Requests<ServerMessageMeasured> {
  constructor() {
    super({ message: "measure", called: "measure", first: 0, last: LAST_REQUEST, refusedAs: (refusal) => new MeasureRefusedError(refusal) });
  }

  /** Sends `measure` for `content` as page `page`, resolving to the server's `measured`, or rejecting with its refusal. */
  measure(app: App, page: number, content: SubPageContent): Promise<ServerMessageMeasured> {
    return this.ask((request) => {
      app.send({ type: "measure", request, page: { page: pageText(page), sub: subText(MEASURED_SUB), ...content } });
    });
  }
}
