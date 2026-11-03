// The index a connection is sent counts the sub-pages of
// the copies its session sees, its own or the channel's, so that it agrees
// with the sub-page list the connection is sent (REQ-1477, REQ-1503; the
// to-do TODO-1539 item 2).

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, typed } from "../src/index.ts";
import { Harness, type Sent } from "../src/testing/index.ts";
import { screen } from "./recorder.ts";

/** The sub-page count page 100 has in an index or a reply. */
function count(message: Sent | undefined): unknown {
  const magazines = message?.["magazines"];
  return Array.isArray(magazines) ? JSON.stringify(magazines).match(/"subpages":(\d+)/u)?.[1] : undefined;
}

/** The connections a message names. */
function named(message: Sent): unknown {
  return message["connections"];
}

test("TODO-1539 item 2: a session with its own copy of a page is told that copy's sub-pages in the index, and only it", () => {
  const own: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publish("channel", 0x100, screen("shared", [null, null, null, null]));
    },
    opened: (session, page, context): void => {
      if (session === 1) {
        context.publishSubpages(session, page, [
          { screen: screen("a", [null, null, null, null]) },
          { screen: screen("b", [null, null, null, null]) },
          { screen: screen("c", [null, null, null, null]) },
        ]);
      }
    },
    input: (session, page, input, context): void => {
      if (typed(input) === "x") {
        context.release(session, page);
      } else {
        context.publishSubpages(session, page, [{ screen: screen("d", [null, null, null, null]) }, { screen: screen("e", [null, null, null, null]) }]);
      }
    },
  };
  const harness = new Harness([own]);
  harness.join(1, 0x100);
  harness.join(2, 0x100);
  const indexes = harness.sent.filter((message) => message["type"] === "index");
  const replies = harness.sent.filter((message) => message["type"] === "reply");
  assert.deepEqual(
    replies.map((message) => count(message)),
    ["3", "1"],
    "session 1's reply counts its own three sub-pages, session 2's the channel's one",
  );
  assert.deepEqual(indexes, [], "no count changed once they were answered");
  const before = harness.sent.length;
  harness.typeText(1, "y");
  harness.typeText(1, "x");
  const after = harness.sent.slice(before).filter((message) => message["type"] === "index");
  assert.deepEqual(
    after.map((message) => [named(message), count(message)]),
    [
      [[1], "2"],
      [[1], "1"],
    ],
    "session 1's own copy going from three sub-pages to two, then released to the channel's one, is told to session 1, and session 2 nothing",
  );
});
