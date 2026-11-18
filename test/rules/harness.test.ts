// The harness under protocol 14 (page-rules.md RULE-55; python.md PY-81):
// every input a test sends names the rule the server's default table
// (RULE-53) would send it by, unless the test names one.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Input, type PageEntry, Screen, TICKS_PER_SECOND } from "../../src/index.ts";
import { Harness } from "../../src/testing/index.ts";

const INDEX = 0x100;

/** A harness of one page, and every input its application hears. */
function hearing(): { readonly harness: Harness; readonly inputs: Input[] } {
  const inputs: Input[] = [];
  const harness = new Harness([
    {
      pages: (): PageEntry[] => [{ page: INDEX, title: "Index", ownsDigits: true, ownsColourKeys: true }],
      start: (context): void => {
        context.publish("channel", INDEX, new Screen());
      },
      input: (_connection, _page, input): boolean => {
        inputs.push(input);
        return true;
      },
    },
  ]);
  harness.join(1, INDEX);
  return { harness, inputs };
}

test("RULE-53, RULE-55: an input sent without a rule names the default table's rule for it", () => {
  const { harness, inputs } = hearing();
  harness.key(1, "a", "press");
  harness.key(1, "a", "repeat");
  harness.key(1, "a", "release");
  harness.typeText(1, "x");
  harness.paste(1, "x");
  harness.send(1, { kind: "compose", cursor: 0, text: "" });
  harness.mouse(1, "press", 0, 1, 1);
  harness.mouse(1, "release", 0, 1, 1);
  harness.move(1, 0, 1, 1);
  harness.send(1, { kind: "mouse", action: "gone", column: 1, row: 1 });
  harness.send(1, { kind: "touch", action: "press", contact: 2, column: 1, row: 1 });
  harness.hover(1, "enter", 1, 1);
  harness.hover(1, "leave", 1, 1);
  harness.send(1, { kind: "drawingHover", drawing: 3, leave: false, commits: 1 });
  harness.send(1, { kind: "drawingHover", drawing: 3, leave: true, commits: 1 });
  harness.send(1, { kind: "focus" });
  harness.send(1, { kind: "blur" });
  harness.wheel(1, 120, 1, 1);
  assert.deepEqual(
    inputs.map((input) => input.rule),
    [
      "keys",
      "keys",
      "keys_up",
      "text",
      "text",
      "text",
      "press",
      "release",
      "move",
      "move",
      "press",
      "hover_in",
      "hover_out",
      "drawing_in",
      "drawing_out",
      "focus",
      "blur",
      "wheel",
    ],
  );
  assert.deepEqual([...new Set(inputs.map((input) => input.target))], [null]);
});

test("RULE-55: an input keeps the rule, tick and target a test gives it, and takes the clock in ticks otherwise", () => {
  const { harness, inputs } = hearing();
  harness.advance(1000);
  harness.typeText(1, "x");
  harness.send(1, { kind: "text", text: "y", rule: "search_box", tick: 5, target: { rect: "pad" } });
  assert.deepEqual(inputs, [
    { kind: "text", text: "x", rule: "text", tick: TICKS_PER_SECOND, target: null },
    { kind: "text", text: "y", rule: "search_box", tick: 5, target: { rect: "pad" } },
  ]);
});

test("RULE-55: the harness gives the channel only what the server could send, and answers only a state query", () => {
  const { harness } = hearing();
  assert.throws(() => {
    harness.fire(1, "Not A Name");
  }, /the server never sends that: rule/u);
  assert.throws(() => {
    harness.answerState({ type: "rules", connections: [1], page: "100", table: null });
  }, /not a query_state/u);
  assert.throws(() => {
    harness.fire(2, "keys");
  }, /connection 2 has no page open/u);
});
