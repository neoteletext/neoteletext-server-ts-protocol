// The commands of a rule table sent as messages of their own (page-rules.md
// RULE-114, RULE-55): each call writes the document's message for a page and
// its sub-code, and checks nothing the schema does not state (DEC-6462).

import assert from "node:assert/strict";
import { test } from "node:test";

import { fixtureLines } from "./fixture.ts";
import { INDEX, SUB, calling } from "./serving.ts";

/** The calls a line of the fixture may name: the commands' (RULE-114), and the picture streams' with how a generation is painted (DEC-7031 item 6). */
const COMMAND_CALLS = ["localMidi", "variable", "timer", "report", "run", "sequence", "regis", "naplps"] as const;
type CommandCall = (typeof COMMAND_CALLS)[number];

function isCommandCall(name: unknown): name is CommandCall {
  return COMMAND_CALLS.some((call) => call === name);
}

const HEXADECIMAL = 16;

/** A fixture line's arguments, each as JSON gives it. */
function argumentsOf(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value.map((item: unknown) => item);
}

/** Whether a fixture line's message writes `at`. */
function writesAt(message: unknown): boolean {
  return typeof message === "object" && message !== null && "at" in message;
}

test("RULE-114, RULE-55: each command sent directly writes the shared fixture's line, which both kits write", () => {
  const lines = fixtureLines("command-lines.jsonl");
  for (const line of lines) {
    const { call, connection, page, sub } = line;
    const given = argumentsOf(line["arguments"]);
    assert.ok(isCommandCall(call) && typeof connection === "number" && typeof page === "string" && typeof sub === "string", String(line["line"]));
    const harness = calling((context) => {
      // The fixture's arguments are JSON, as a program written in JavaScript could give them: the schema's check is the server's.
      Reflect.apply(context[call], context, [{ connection }, Number.parseInt(page, HEXADECIMAL), Number.parseInt(sub, HEXADECIMAL), ...given]);
    });
    const sent = harness.sent.filter((written) => COMMAND_CALLS.some((name) => written["type"] === (name === "localMidi" ? "local_midi" : name)));
    assert.deepEqual(
      sent.map((written) => JSON.stringify(written)),
      [JSON.stringify(line["message"])],
      `${String(line["line"])}: the same text, every field in its order`,
    );
    assert.deepEqual(harness.errors, []);
  }
});

test("TODO-6681 item 4: a sequence started with no time, or with null, is written with no at", () => {
  const starts = fixtureLines("command-lines.jsonl").filter((line) => String(line["line"]).startsWith("sequence-start-") && !writesAt(line["message"]));
  assert.deepEqual(
    starts.map((line) => line["line"]),
    ["sequence-start-no-at", "sequence-start-at-null"],
  );
});

test("RULE-114, DEC-6462: what only the server refuses of a command is sent, and what the schema refuses is not", () => {
  const thrown: string[] = [];
  const harness = calling((context) => {
    // invalid_command (an amount, or the firing, outside a group) and unknown_name are the server's (RULE-39).
    context.variable({ connection: 7 }, INDEX, SUB, { op: "set", variable: "v0", value: { plus: 1, fired: "key" } });
    context.report({ connection: 7 }, INDEX, SUB, null);
    context.run({ connection: 7 }, INDEX, SUB, "no_such_group");
    for (const call of [
      // A name is RULE-36's pattern, and a local sound's audio channel is 0 to 3.
      (): void => {
        context.sequence({ connection: 7 }, INDEX, SUB, "start", "Not A Name");
      },
      (): void => {
        context.localMidi({ connection: 7 }, INDEX, SUB, 4, { event: "note_on", channel: 1, key: 60, velocity: 100 });
      },
    ]) {
      try {
        call();
      } catch (error) {
        thrown.push(error instanceof Error ? error.name : String(error));
      }
    }
  });
  assert.deepEqual(
    harness.sent.filter((line) => ["variable", "report", "run", "sequence", "local_midi"].includes(String(line["type"]))).map((line) => line["type"]),
    ["variable", "report", "run"],
  );
  assert.deepEqual(thrown, ["ProtocolError", "ProtocolError"]);
});
