// The testing entry's SERVER_LIMITS against what the server now sends:
// its reply limit was raised from a provisional 5,000 ms to 7,000 ms
// (DEC-2438, neoteletext-app-server 19c751f). scripts/check.sh also
// compares the figure with the server's PROGRAM_REPLY_LIMIT_MS itself.

import assert from "node:assert/strict";
import { test } from "node:test";

import { readMessage } from "../src/wire/server-message.ts";
import { START_LINE } from "./fixtures/start-line.ts";

/** DEC-2438: the slowest answer measured, straight after the server and its programs started together (Hackaday, 3 and 4 November 2026). */
const SLOWEST_MEASURED_MS = 3387;
/** DEC-2438: the limit is twice the slowest answer measured. */
const MARGIN = 2;
/** DEC-2438: rounded up to a whole second. */
const MS_PER_SECOND = 1000;

test("start, as the harness tells a program, carries the server's reply limit of DEC-2438", () => {
  const expected = Math.ceil((MARGIN * SLOWEST_MEASURED_MS) / MS_PER_SECOND) * MS_PER_SECOND;
  const start = readMessage(START_LINE);
  assert.ok(typeof start !== "string" && start.type === "start", JSON.stringify(start));
  assert.equal(start.limits.budgets.replyLimitMs, expected);
});
