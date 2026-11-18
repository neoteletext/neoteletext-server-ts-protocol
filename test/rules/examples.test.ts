// The worked examples of page-rules.md section 7.5 and the music player's
// table of RULE-93 are written by `context.rules` as exactly the document's
// JSON (RULE-55; python.md PY-80): test/fixtures/rules-examples.jsonl holds
// each `rules` message as the document writes it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Application, type PageEntry, Screen } from "../../src/index.ts";
import { Harness } from "../../src/testing/index.ts";
import { fixtureLines } from "./fixture.ts";
import { EXAMPLES, type Example } from "./tables.ts";

/** The connection the music player's example names. */
const VIEWER = 7;

/** A channel of the example's page that gives it its table when a connection opens it. */
function channelOf({ to, page, table }: Example): Application {
  return {
    pages: (): PageEntry[] => [{ page, title: "Example" }],
    start: (context): void => {
      context.publish("channel", page, new Screen());
    },
    opened: (_connection, _page, context): void => {
      context.rules(to, page, table);
    },
  };
}

test("RULE-55: the fixture holds the six examples of section 7.5 and the music player's table, and the kit builds every one", () => {
  assert.deepEqual(
    fixtureLines("rules-examples.jsonl").map((line) => line["example"]),
    EXAMPLES.map(({ example }) => example),
  );
});

for (const example of EXAMPLES) {
  test(`RULE-35, RULE-55: ${example.example} is written as exactly the document's JSON`, () => {
    const expected = fixtureLines("rules-examples.jsonl").find((line) => line["example"] === example.example)?.["message"];
    const harness = new Harness([channelOf(example)]);
    harness.join(VIEWER, example.page);
    const written = harness.sent.filter((line) => line["type"] === "rules");
    assert.equal(written.length, 1);
    assert.equal(JSON.stringify(written[0]), JSON.stringify(expected), "the same text: every field, in the document's order");
    assert.deepEqual(harness.errors, []);
  });
}

test("RULE-93: the music player's table has 47 rules, and none sends its channel anything", () => {
  const table = EXAMPLES.find(({ example }) => example === "music-player")?.table;
  assert.equal(table?.rules.length, 47);
  assert.deepEqual(
    table?.rules.filter((rule) => rule.echo === true || rule.do.some((action) => action.action === "send")),
    [],
  );
});
