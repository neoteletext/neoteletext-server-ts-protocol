// A page published from TTI names its sub-pages in its sub-page list
// (REQ-1503) by the titles given beside the TTI, which has no line for one
// (the to-do TODO-1539 item 4).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Application, PageEntry } from "../src/index.ts";
import { Harness } from "../src/testing/index.ts";

const TWO_SUBPAGES = "PN,10001\nOL,1,first\nPN,10002\nOL,1,second\n";

function channel(titles?: readonly (string | null)[]): Harness {
  const application: Application = {
    pages: (): PageEntry[] => [{ page: 0x100, title: "Index" }],
    start: (context): void => {
      context.publishTti("channel", 0x100, TWO_SUBPAGES, titles);
    },
  };
  const harness = new Harness([application]);
  harness.join(1, 0x100);
  return harness;
}

function listed(harness: Harness): unknown {
  return harness.sent.find((message) => message["type"] === "subpages")?.["subpages"];
}

test("a page published from TTI lists its sub-pages by the titles given, and by none without them", () => {
  assert.deepEqual(listed(channel(["First", null])), [
    { sub: "0001", title: "First" },
    { sub: "0002", title: null },
  ]);
  assert.deepEqual(listed(channel()), [
    { sub: "0001", title: null },
    { sub: "0002", title: null },
  ]);
  const tooMany = channel(["a", "b", "c"]);
  assert.ok(
    tooMany.errors.some((error) => error.includes("3 titles for 2 sub-pages")),
    tooMany.errors.join("\n"),
  );
  assert.equal(listed(tooMany), undefined, "nothing is published");
});
