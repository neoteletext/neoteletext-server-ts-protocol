// A program's measures of its pages (REQ-2216 item 4), and what `start`
// and `connected` tell its applications: the languages (REQ-2215) and each
// viewer's cookies (REQ-2217's ground in the kit).

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Context, MeasureRefusedError, type Measured, type PageEntry, Screen } from "../src/index.ts";
import { Harness, SERVER_LANGUAGES } from "../src/testing/index.ts";

const PAGE = 0x100;
const MEASURED: Measured = { triplets: 5, limit: 208, designation: { default: 0, second: null }, runs: [{ cells: 6, triplets: 3 }] };

/** A harness whose one application keeps its context from `start`, for the test to call. */
interface Started {
  readonly harness: Harness;
  readonly context: () => Context;
}

function started(): Started {
  let kept: Context | null = null;
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: PAGE, title: "Measured" }],
      start: (context): void => {
        kept = context;
      },
      joined: (_session, context): void => {
        kept = context;
      },
    },
  ]);
  return {
    harness,
    context: (): Context => {
      assert.ok(kept !== null);
      return kept;
    },
  };
}

function screen(): Screen {
  const drawn = new Screen();
  drawn.language("en");
  drawn.text(1, 0, "Привет", "ru");
  return drawn;
}

test("REQ-2216 item 4: measure sends the page with a number of its own and resolves to the server's measured", async () => {
  const { harness, context } = started();
  const first = context().measure(PAGE, screen());
  const second = context().measure(PAGE, screen());
  const sent = harness.sent.filter((message) => message["type"] === "measure");
  assert.deepEqual(
    sent.map((message) => message["request"]),
    [0, 1],
  );
  assert.match(JSON.stringify(sent[0]?.["page"]), /"text":\[\{"row":1,"column":0,"text":"Привет","language":"ru"\}\]/u);
  harness.channel.measured(1, { ...MEASURED, triplets: 9 });
  harness.channel.measured(0, MEASURED);
  assert.deepEqual(await first, MEASURED);
  assert.equal((await second).triplets, 9, "each answer settles the measure of its number");
  assert.deepEqual(harness.errors, []);
});

test("REQ-2216 item 4: a measure the server refuses rejects with the refusal; another refusal of that number is not its", async () => {
  const { harness, context } = started();
  const measured = context().measure(PAGE, screen());
  const refusal = { message: "measure", request: 0, path: "page.text[0].text", rule: "text_unshown", detail: "U+4E2D" };
  harness.channel.refused({ ...refusal, message: "page" });
  assert.equal(harness.errors.length, 1, "a page's refusal of the same number is reported, not taken for the measure's");
  harness.channel.refused(refusal);
  await assert.rejects(measured, (error: unknown) => error instanceof MeasureRefusedError && error.refusal.rule === "text_unshown");
  harness.channel.measured(0, MEASURED);
  assert.match(harness.errors.at(-1) ?? "", /nothing waits/u, "an answer to nothing is reported");
});

test("REQ-2216: a measure waiting when the server starts again is rejected", async () => {
  const { harness, context } = started();
  const measured = context().measure(PAGE, screen());
  harness.channel.start(0, { standard: context().limits().standard, budgets: context().limits().budgets }, SERVER_LANGUAGES);
  await assert.rejects(measured, /started again/u);
});

test("REQ-2215: an application has the languages start listed", () => {
  const { context } = started();
  assert.equal(context().languages(), SERVER_LANGUAGES);
});

test("an application reads a viewer's cookies as their connection opened with them", () => {
  const { harness, context } = started();
  harness.join(3, PAGE, [
    { name: "language", value: "ru" },
    { name: "seen", value: "1" },
  ]);
  assert.deepEqual(context().cookies(3), { language: "ru", seen: "1" });
  assert.deepEqual(context().cookies(4), {}, "a session with no connection has none");
});
