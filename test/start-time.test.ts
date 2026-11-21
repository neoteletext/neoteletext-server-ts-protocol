// The fault of TODO-7165. `start`'s `epoch_ms` is the server's clock as it wrote the
// line, and a program reads the line later, once it has loaded. A channel's
// real time is the time at that read, not the stamp: taken for the stamp, a
// channel's clock ran behind by the line's wait for its whole life (live,
// 534 milliseconds).

import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import { runChannel, type PageEntry } from "../src/index.ts";
import { timeAtRead } from "../src/channel/start-time.ts";
import { START_LINE } from "./fixtures/start-line.ts";

/** How long before its read the test's `start` was stamped: far more than a run of this test takes, so the old reading cannot pass by chance. */
const WAITED_MS = 5_000;
/** A moment of November 2026, for the cases that name their clocks. */
const STAMPED_MS = 1_795_292_603_691;
/** The wait measured live between the server's stamp and the program's read (TODO-7165). */
const LIVE_WAIT_MS = 534;

/** The program's lines, which this test does not read. */
function ignored(): void {
  // Nothing is asserted of what the channel writes.
}

test("the time at the read of start is the machine's clock, the stamp and the line's wait together", () => {
  assert.equal(timeAtRead(STAMPED_MS, STAMPED_MS + LIVE_WAIT_MS), STAMPED_MS + LIVE_WAIT_MS);
  assert.equal(timeAtRead(STAMPED_MS, STAMPED_MS), STAMPED_MS);
});

test("a machine's clock behind the stamp is not the clock that stamped it, so the stamp stands", () => {
  assert.equal(timeAtRead(STAMPED_MS, STAMPED_MS - 1), STAMPED_MS);
  assert.equal(timeAtRead(STAMPED_MS, 0), STAMPED_MS);
});

test("a running program's real time follows the machine's clock when start waited to be read", async () => {
  const input = new PassThrough();
  const seen: number[] = [];
  const served = runChannel(
    [
      {
        pages: (): PageEntry[] => [],
        start: (context): void => {
          seen.push(context.epochMs());
        },
      },
    ],
    { streams: { input, output: ignored, errors: (text) => assert.fail(text) } },
  );
  const before = Date.now();
  input.end(`${START_LINE.replace('"epoch_ms":0', `"epoch_ms":${before - WAITED_MS}`)}\n`);
  await served;
  const after = Date.now();
  const [atStart] = seen;
  assert.ok(atStart !== undefined && seen.length === 1, "start was heard once");
  assert.ok(atStart >= before && atStart <= after, `the real time ${atStart} lies between the clock before the read, ${before}, and after it, ${after}`);
});
