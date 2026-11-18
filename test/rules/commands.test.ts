// The commands of a rule table sent as messages of their own (page-rules.md
// RULE-114, RULE-55): each call writes the document's message for a page and
// its sub-code, and checks nothing the schema does not state (DEC-6462).

import assert from "node:assert/strict";
import { test } from "node:test";

import { INDEX, SUB, calling } from "./serving.ts";

test("RULE-114: each command sent directly writes the document's message", () => {
  const to = { connection: 7 } as const;
  const harness = calling((context) => {
    context.localMidi(to, 0x101, SUB, 0, { event: "note_on", channel: 1, key: 60, velocity: 100 });
    context.variable(to, 0x101, SUB, { op: "set", variable: "v0", value: 4 });
    context.variable(to, 0x101, SUB, { op: "add", variable: "v0", value: { plus: 0, variable: "v1" } });
    context.variable(to, 0x101, SUB, { op: "set", variable: "v2", value: { read: { of: "sound", channel: 0, property: "level" } } });
    context.variable(to, 0x101, SUB, { op: "wrap", variable: "v0", low: 0, high: 3 });
    context.variable(to, 0x101, SUB, { op: "clear", variable: "all" });
    context.timer(to, 0x101, SUB, "start", "t0");
    context.report(to, 0x101, SUB, { of: "variable", variable: "v0" });
    context.run(to, 0x101, SUB, "flash");
    context.sequence(to, 0x101, SUB, "start", "pulse", null);
    context.sequence(to, 0x101, SUB, "start", "flash_once", { tick: 5400 });
    context.sequence(to, 0x101, SUB, "start", "pulse", { beat: { timer: "t0", ticks: 30 } });
    context.sequence(to, 0x101, SUB, "stop", null);
  });
  const page = { connections: [7], page: "101", sub: "0001" };
  const commands = harness.sent.filter((line) => ["local_midi", "variable", "timer", "report", "run", "sequence"].includes(String(line["type"])));
  // RULE-114's examples, each with its fields in the document's order.
  assert.deepEqual(
    commands.map((line) => JSON.stringify(line)),
    [
      { type: "local_midi", ...page, channel: 0, message: { event: "note_on", channel: 1, key: 60, velocity: 100 } },
      { type: "variable", ...page, op: "set", variable: "v0", value: 4 },
      { type: "variable", ...page, op: "add", variable: "v0", value: { plus: 0, variable: "v1" } },
      { type: "variable", ...page, op: "set", variable: "v2", value: { read: { of: "sound", channel: 0, property: "level" } } },
      { type: "variable", ...page, op: "wrap", variable: "v0", low: 0, high: 3 },
      { type: "variable", ...page, op: "clear", variable: "all" },
      { type: "timer", ...page, op: "start", timer: "t0" },
      { type: "report", ...page, value: { of: "variable", variable: "v0" } },
      { type: "run", ...page, group: "flash" },
      { type: "sequence", ...page, op: "start", sequence: "pulse", at: null },
      { type: "sequence", ...page, op: "start", sequence: "flash_once", at: { tick: 5400 } },
      { type: "sequence", ...page, op: "start", sequence: "pulse", at: { beat: { timer: "t0", ticks: 30 } } },
      { type: "sequence", ...page, op: "stop", sequence: null },
    ].map((line) => JSON.stringify(line)),
  );
  assert.deepEqual(harness.errors, []);
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
