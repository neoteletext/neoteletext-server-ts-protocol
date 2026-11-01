// A program that will not answer a selection with a page (`INPUT.md` section
// 7.12): what `Context.deny` sends, and that nothing else answers it.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Application, Context, PageEntry, PageRequest, WireDeniedStatus } from "../src/index.ts";
import { Harness } from "../src/testing/index.ts";
import { screen } from "./recorder.ts";

const OPEN = 0x100;
const CLOSED = 0x200;
const FORBIDDEN: WireDeniedStatus = 403;
const BUSY: WireDeniedStatus = 429;
/** The numbers of a connection's first two selections, as the server gives them. */
const FIRST_SELECTION = 1;
const SECOND_SELECTION = 2;

/** A channel of two pages, the second of which is denied when it is asked for. */
function guarded(status: WireDeniedStatus): Application {
  return {
    pages: (): PageEntry[] => [
      { page: OPEN, title: "Open" },
      { page: CLOSED, title: "Closed" },
    ],
    start: (context): void => {
      context.publish("channel", OPEN, screen("open"));
      context.publish("channel", CLOSED, screen("closed"));
    },
    request: (session: number, page: number, request: PageRequest | null, context: Context): void => {
      if (page === CLOSED && request !== null) {
        context.deny(session, status);
      }
    },
  };
}

test("a selection denied has `denied` for its answer, and no page", () => {
  const harness = new Harness([guarded(FORBIDDEN)]);
  harness.join(1, OPEN);
  const before = harness.sent.length;
  harness.open(1, CLOSED);
  const answers = harness.sent.slice(before);
  assert.deepEqual(
    answers.map((message) => message["type"]),
    ["denied"],
  );
  assert.equal(answers[0]?.["status"], FORBIDDEN);
  assert.equal(answers[0]?.["connection"], 1);
  assert.equal(answers[0]?.["request"], SECOND_SELECTION);
  assert.deepEqual(harness.errors, []);
});

test("the first selection denied has its `reply`, with no page, and then `denied`", () => {
  const harness = new Harness([guarded(BUSY)]);
  harness.join(1, CLOSED);
  const answers = harness.sent.filter((message) => message["type"] === "reply" || message["type"] === "page" || message["type"] === "denied");
  assert.deepEqual(
    answers.map((message) => message["type"]),
    ["reply", "denied"],
  );
  assert.equal(answers[0]?.["selected"], null);
  assert.equal(answers[1]?.["status"], BUSY);
});

test("a selection after one denied is answered again", () => {
  const harness = new Harness([guarded(FORBIDDEN)]);
  harness.join(1, CLOSED);
  const before = harness.sent.length;
  harness.open(1, OPEN);
  assert.ok(
    harness.sent.slice(before).some((message) => message["type"] === "page"),
    "the next page is shown",
  );
});

test("outside an answer, `deny` ends the selection the session has", () => {
  const denies: Application = {
    pages: (): PageEntry[] => [{ page: OPEN, title: "Open" }],
    start: (context): void => {
      context.publish("channel", OPEN, screen("open"));
    },
    input: (session, _page, _input, context): void => {
      context.deny(session, BUSY);
    },
  };
  const harness = new Harness([denies]);
  harness.join(1, OPEN);
  harness.typeText(1, "x");
  const denied = harness.sent.find((message) => message["type"] === "denied");
  assert.equal(denied?.["status"], BUSY);
  assert.equal(denied?.["request"], FIRST_SELECTION);
});
